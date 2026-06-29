import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import makeWASocket, { 
  DisconnectReason, 
  AuthenticationState, 
  initAuthCreds,
  BufferJSON,
  SignalDataTypeMap
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private socket: any;
  private status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
  private qrUrl: string | null = null;
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp Service...');
    await this.connectToWhatsApp();
  }

  async onModuleDestroy() {
    if (this.socket) {
      this.socket.end(undefined);
    }
  }

  private async usePrismaAuthState(): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> {
    const writeData = async (data: any, id: string) => {
      await this.prisma.whatsappSession.upsert({
        where: { id },
        update: { data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
        create: { id, data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
      });
    };

    const readData = async (id: string) => {
      const session = await this.prisma.whatsappSession.findUnique({ where: { id } });
      if (session && session.data) {
        return JSON.parse(JSON.stringify(session.data), BufferJSON.reviver);
      }
      return null;
    };

    const removeData = async (id: string) => {
      try {
        await this.prisma.whatsappSession.delete({ where: { id } });
      } catch (err) {
        // ignore if not found
      }
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => {
            const data: { [key: string]: any } = {};
            await Promise.all(
              ids.map(async (id) => {
                let value = await readData(`${type}-${id}`);
                if (type === 'app-state-sync-key' && value) {
                  value = {
                    ...value,
                    get: undefined
                  }; // Workaround for Baileys types
                }
                data[id] = value;
              })
            );
            return data;
          },
          set: async (data) => {
            const tasks: Promise<void>[] = [];
            for (const category in data) {
              for (const id in data[category as keyof SignalDataTypeMap]) {
                const value = data[category as keyof SignalDataTypeMap]?.[id];
                const key = `${category}-${id}`;
                if (value) {
                  tasks.push(writeData(value, key));
                } else {
                  tasks.push(removeData(key));
                }
              }
            }
            await Promise.all(tasks);
          }
        }
      },
      saveCreds: () => writeData(creds, 'creds')
    };
  }

  async connectToWhatsApp() {
    const { state, saveCreds } = await this.usePrismaAuthState();

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) as any,
    });

    this.socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.status = 'CONNECTING';
        this.qrUrl = await QRCode.toDataURL(qr);
        this.logger.log('New QR code generated.');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.logger.warn(`Connection closed. Reconnecting: ${shouldReconnect}`);
        
        this.status = 'DISCONNECTED';
        this.qrUrl = null;

        if (shouldReconnect) {
          setTimeout(() => this.connectToWhatsApp(), 3000);
        } else {
          // Logged out. Delete session.
          await this.prisma.whatsappSession.deleteMany();
          this.logger.log('User logged out, session deleted.');
        }
      } else if (connection === 'open') {
        this.status = 'CONNECTED';
        this.qrUrl = null;
        this.logger.log('Successfully connected to WhatsApp!');
      }
    });

    this.socket.ev.on('creds.update', saveCreds);
  }

  async getStatus() {
    let phoneNumber = null;
    if (this.status === 'CONNECTED' && this.socket?.user?.id) {
      // id is usually something like 9665XXXXXXX:2@s.whatsapp.net
      const jid = this.socket.user.id;
      phoneNumber = jid.split(':')[0].split('@')[0];
    }
    
    return {
      status: this.status,
      qr: this.qrUrl,
      phoneNumber
    };
  }

  async getQrCode() {
    let phoneNumber = null;
    if (this.status === 'CONNECTED' && this.socket?.user?.id) {
      const jid = this.socket.user.id;
      phoneNumber = jid.split(':')[0].split('@')[0];
      return { status: 'CONNECTED', qr: null, phoneNumber };
    }
    
    if (!this.socket || this.status === 'DISCONNECTED') {
      await this.connectToWhatsApp();
      // wait a bit for QR to generate
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      status: this.status,
      qr: this.qrUrl,
      phoneNumber: null
    };
  }

  async logout() {
    if (this.socket) {
      await this.socket.logout();
    }
    await this.prisma.whatsappSession.deleteMany();
    this.status = 'DISCONNECTED';
    this.qrUrl = null;
    return { success: true };
  }

  async sendMessage(to: string, text: string) {
    if (this.status !== 'CONNECTED' || !this.socket) {
      this.logger.error('WhatsApp is not connected. Cannot send message.');
      return false;
    }

    try {
      // Format phone number for Saudi Arabia if it starts with 05
      let formattedPhone = to.replace(/\D/g, ''); // Remove non-digits
      if (formattedPhone.startsWith('05')) {
        formattedPhone = '9665' + formattedPhone.slice(2);
      } else if (formattedPhone.startsWith('5')) {
        formattedPhone = '9665' + formattedPhone.slice(1);
      }
      
      // Ensure it ends with @s.whatsapp.net
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      await this.socket.sendMessage(jid, { text });
      this.logger.log(`Message sent successfully to ${formattedPhone}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}:`, error);
      return false;
    }
  }
}

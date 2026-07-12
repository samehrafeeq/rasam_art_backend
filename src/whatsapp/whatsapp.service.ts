import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import makeWASocket, {
  DisconnectReason,
  AuthenticationState,
  initAuthCreds,
  BufferJSON,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';

interface InstanceState {
  socket: any;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  qrUrl: string | null;
  phoneNumber: string | null;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private instances = new Map<number, InstanceState>();
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp Multi-Instance Service...');
    // Auto-connect all existing instances from DB
    const allInstances = await this.prisma.whatsappInstance.findMany();
    for (const instance of allInstances) {
      await this.connectInstance(instance.id);
    }
  }

  async onModuleDestroy() {
    for (const [, state] of this.instances) {
      if (state.socket) {
        try { state.socket.end(undefined); } catch {}
      }
    }
  }

  // ─── Auth State per Instance ─────────────────────────────────────────────

  private async usePrismaAuthState(instanceId: number): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const prefix = `${instanceId}:`;

    const writeData = async (data: any, id: string) => {
      await this.prisma.whatsappSession.upsert({
        where: { id: `${prefix}${id}` },
        update: { data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
        create: {
          id: `${prefix}${id}`,
          data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
          instanceId,
        },
      });
    };

    const readData = async (id: string) => {
      const session = await this.prisma.whatsappSession.findUnique({
        where: { id: `${prefix}${id}` },
      });
      if (session?.data) {
        return JSON.parse(JSON.stringify(session.data), BufferJSON.reviver);
      }
      return null;
    };

    const removeData = async (id: string) => {
      try {
        await this.prisma.whatsappSession.delete({
          where: { id: `${prefix}${id}` },
        });
      } catch {}
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
                  value = { ...value, get: undefined };
                }
                data[id] = value;
              }),
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
          },
        },
      },
      saveCreds: () => writeData(creds, 'creds'),
    };
  }

  // ─── Connect Instance ────────────────────────────────────────────────────

  async connectInstance(instanceId: number) {
    // If already connected, skip
    const existing = this.instances.get(instanceId);
    if (existing?.status === 'CONNECTED') return;

    const { state, saveCreds } = await this.usePrismaAuthState(instanceId);

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) as any,
    });

    const instanceState: InstanceState = {
      socket,
      status: 'CONNECTING',
      qrUrl: null,
      phoneNumber: null,
    };
    this.instances.set(instanceId, instanceState);

    socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        instanceState.status = 'CONNECTING';
        instanceState.qrUrl = await QRCode.toDataURL(qr);
        this.logger.log(`[Instance ${instanceId}] New QR code generated.`);
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        this.logger.warn(
          `[Instance ${instanceId}] Connection closed. Reconnecting: ${shouldReconnect}`,
        );

        instanceState.status = 'DISCONNECTED';
        instanceState.qrUrl = null;
        instanceState.phoneNumber = null;

        if (shouldReconnect) {
          setTimeout(() => this.connectInstance(instanceId), 3000);
        } else {
          // Logged out — clear sessions for this instance
          await this.prisma.whatsappSession.deleteMany({
            where: { instanceId },
          });
          this.instances.delete(instanceId);
          this.logger.log(`[Instance ${instanceId}] Logged out, session deleted.`);
        }
      } else if (connection === 'open') {
        instanceState.status = 'CONNECTED';
        instanceState.qrUrl = null;
        if (socket.user?.id) {
          const jid = socket.user.id;
          instanceState.phoneNumber = jid.split(':')[0].split('@')[0];
        }
        this.logger.log(
          `[Instance ${instanceId}] Connected! Phone: ${instanceState.phoneNumber}`,
        );
      }
    });

    socket.ev.on('creds.update', saveCreds);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Create a new WhatsApp instance in DB and start connecting */
  async createInstance(name: string) {
    const instance = await this.prisma.whatsappInstance.create({
      data: { name },
    });
    await this.connectInstance(instance.id);
    // Wait briefly for QR to generate
    await new Promise((r) => setTimeout(r, 2000));
    return this.getInstanceStatus(instance.id);
  }

  /** Get status of all instances */
  async getAllInstancesStatus() {
    const dbInstances = await this.prisma.whatsappInstance.findMany({
      include: { regions: { select: { id: true, name: true } } },
    });

    return dbInstances.map((inst) => {
      const state = this.instances.get(inst.id);
      return {
        id: inst.id,
        name: inst.name,
        status: state?.status ?? 'DISCONNECTED',
        qr: state?.qrUrl ?? null,
        phoneNumber: state?.phoneNumber ?? null,
        regions: inst.regions,
      };
    });
  }

  /** Get status of a single instance */
  async getInstanceStatus(instanceId: number) {
    const inst = await this.prisma.whatsappInstance.findUnique({
      where: { id: instanceId },
      include: { regions: { select: { id: true, name: true } } },
    });
    if (!inst) return null;

    const state = this.instances.get(instanceId);
    return {
      id: inst.id,
      name: inst.name,
      status: state?.status ?? 'DISCONNECTED',
      qr: state?.qrUrl ?? null,
      phoneNumber: state?.phoneNumber ?? null,
      regions: inst.regions,
    };
  }

  /** Request QR code for an instance (reconnect if needed) */
  async getQrForInstance(instanceId: number) {
    const state = this.instances.get(instanceId);

    if (state?.status === 'CONNECTED') {
      return this.getInstanceStatus(instanceId);
    }

    // Reconnect to generate QR
    if (!state || state.status === 'DISCONNECTED') {
      await this.connectInstance(instanceId);
      await new Promise((r) => setTimeout(r, 2000));
    }

    return this.getInstanceStatus(instanceId);
  }

  /** Logout a specific instance */
  async logoutInstance(instanceId: number) {
    const state = this.instances.get(instanceId);
    if (state?.socket) {
      try { await state.socket.logout(); } catch {}
    }
    await this.prisma.whatsappSession.deleteMany({ where: { instanceId } });
    this.instances.delete(instanceId);
    return { success: true };
  }

  /** Delete an instance entirely */
  async deleteInstance(instanceId: number) {
    await this.logoutInstance(instanceId);
    await this.prisma.whatsappInstance.delete({ where: { id: instanceId } });
    return { success: true };
  }

  // ─── Message Sending ─────────────────────────────────────────────────────

  /**
   * Format a phone number to international format.
   * Handles Saudi Arabia (05xx / 5xx) and keeps already-international numbers.
   */
  private formatPhone(phone: string): string {
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('05')) {
      formatted = '966' + formatted.slice(1);
    } else if (formatted.startsWith('5') && formatted.length === 9) {
      formatted = '9665' + formatted.slice(1);
    }
    return formatted;
  }

  /**
   * Send a WhatsApp message using the instance assigned to the given region.
   * Falls back to the first available connected instance if the region has none.
   */
  async sendMessageForRegion(regionId: number, to: string, text: string): Promise<boolean> {
    // 1. Find the region's assigned instance
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { whatsappInstanceId: true },
    });

    let instanceId: number | null = region?.whatsappInstanceId ?? null;

    // 2. If region has no assigned instance, use first connected instance
    if (!instanceId) {
      for (const [id, state] of this.instances) {
        if (state.status === 'CONNECTED') {
          instanceId = id;
          break;
        }
      }
    }

    if (!instanceId) {
      this.logger.warn(`No connected WhatsApp instance available for region ${regionId}`);
      return false;
    }

    return this.sendMessageFromInstance(instanceId, to, text);
  }

  /** Send from a specific instance */
  async sendMessageFromInstance(instanceId: number, to: string, text: string): Promise<boolean> {
    const state = this.instances.get(instanceId);
    if (!state || state.status !== 'CONNECTED' || !state.socket) {
      this.logger.error(`[Instance ${instanceId}] Not connected. Cannot send.`);
      return false;
    }

    try {
      const formattedPhone = this.formatPhone(to);
      const jid = `${formattedPhone}@s.whatsapp.net`;
      await state.socket.sendMessage(jid, { text });
      this.logger.log(`[Instance ${instanceId}] Message sent to ${formattedPhone}`);
      return true;
    } catch (error) {
      this.logger.error(`[Instance ${instanceId}] Failed to send to ${to}:`, error);
      return false;
    }
  }

  // ─── Legacy compatibility (kept for any direct calls) ──────────────────

  async sendMessage(to: string, text: string): Promise<boolean> {
    // Use first connected instance
    for (const [instanceId, state] of this.instances) {
      if (state.status === 'CONNECTED') {
        return this.sendMessageFromInstance(instanceId, to, text);
      }
    }
    this.logger.warn('No connected WhatsApp instance available.');
    return false;
  }
}

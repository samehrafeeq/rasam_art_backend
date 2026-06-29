import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { WhatsappService } from './src/whatsapp/whatsapp.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const whatsappService = app.get(WhatsappService);
  
  // Wait for connection
  console.log('Waiting 5s for whatsapp connection...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const status = await whatsappService.getStatus();
  console.log('Status:', status);
  
  if (status.status === 'CONNECTED') {
    console.log('Sending test message to 0509756675...');
    const result = await whatsappService.sendMessage('0509756675', 'رسالة تجريبية من النظام للتأكد من عمل الواتساب 🛠️');
    console.log('Send result:', result);
  } else {
    console.log('Not connected, cannot send message.');
  }
  
  await app.close();
}
bootstrap();

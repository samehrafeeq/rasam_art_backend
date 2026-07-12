import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { WhatsappService } from './src/whatsapp/whatsapp.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const whatsappService = app.get(WhatsappService);
  
  console.log('Waiting 5s for whatsapp connection...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const instances = await whatsappService.getAllInstancesStatus();
  console.log('Instances:', instances);
  
  const connected = instances.find(i => i.status === 'CONNECTED');
  if (connected) {
    console.log(`Sending test message via instance: ${connected.name}...`);
    const result = await whatsappService.sendMessageFromInstance(connected.id, '0509756675', 'رسالة تجريبية من النظام للتأكد من عمل الواتساب 🛠️');
    console.log('Send result:', result);
  } else {
    console.log('No connected instances found.');
  }
  
  await app.close();
}

bootstrap().catch(console.error);

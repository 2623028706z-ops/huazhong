import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { configureApp } from './app.ts'
import { AppModule } from './app.module.ts'
import { nestLogger } from './common/logger.ts'
import { loadEnv } from './env.ts'

const env = loadEnv(process.env)
const app = await NestFactory.create(AppModule.forRoot(env), { logger: nestLogger })
configureApp(app)
app.enableShutdownHooks()
await app.listen(env.PORT)

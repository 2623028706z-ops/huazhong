import { Module } from '@nestjs/common'
import { JobsService } from './jobs.service.ts'

@Module({ providers: [JobsService] })
export class JobsModule {}

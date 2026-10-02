import { type contract, type OutputOf } from '@huazhong/shared'
import { FileStorage, MemoryFileStorage } from '../../src/common/storage.ts'
import { dataOf, type Api, type SalesApp } from './sales.ts'

export async function uploadAfterImage(s: SalesApp, api: Api): Promise<string> {
  const storage = s.t.app.get(FileStorage)
  if (!(storage instanceof MemoryFileStorage)) throw new Error('expected MemoryFileStorage')
  const ticket = dataOf<OutputOf<typeof contract.requestUploadTicket>>(
    await api.post('/files/upload-ticket', {
      purpose: 'after_image',
      mime: 'image/jpeg',
      sizeBytes: 1000,
    }),
  )
  storage.put(ticket.formData['key'] ?? '')
  dataOf(await api.post(`/files/${ticket.fileId}/complete`, {}))
  return ticket.fileId
}

import mongoose, { type Connection } from 'mongoose'

export async function connectDB(uri: string): Promise<Connection> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  return mongoose.connection
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect()
}

import { Schema, model } from 'mongoose'

export interface Counter {
  _id: string
  seq: number
}

const counterSchema = new Schema<Counter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 1 },
  },
  { versionKey: false },
)

export const Counter = model<Counter>('Counter', counterSchema)
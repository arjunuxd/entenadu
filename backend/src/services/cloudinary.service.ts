import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

const { cloudName, apiKey, apiSecret } = env.cloudinary

const isConfigured = cloudName.trim() !== '' && apiKey.trim() !== '' && apiSecret.trim() !== ''

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })
}

const UPLOAD_FOLDER = 'ente-nadu/complaints'

interface CloudinaryUploadResult {
  secure_url?: string
}

export async function uploadPhoto(buffer: Buffer, contentType: string): Promise<string> {
  if (!isConfigured) {
    throw new Error('CLOUDINARY credentials are not configured')
  }

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: UPLOAD_FOLDER,
        resource_type: 'image',
        format: contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg',
      },
      (error, result) => {
        if (error || !result) {
          reject(new Error('Cloudinary upload failed'))
          return
        }

        const url = (result as CloudinaryUploadResult).secure_url

        if (!url) {
          reject(new Error('Cloudinary upload returned no URL'))
          return
        }

        resolve(url)
      },
    )

    uploadStream.on('error', (error: Error) => {
      reject(error)
    })

    uploadStream.write(buffer)
    uploadStream.end()
  })
}
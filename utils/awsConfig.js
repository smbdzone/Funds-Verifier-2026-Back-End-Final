import { S3Client } from '@aws-sdk/client-s3'
import { awsConfig, readCloudFrontPrivateKey } from '../config/s3.js'

let _s3
let _cloudFrontPrivateKey

export function getS3Client() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: awsConfig.region,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    },
  })
  return _s3
}

export function getCloudFrontPrivateKey() {
  if (_cloudFrontPrivateKey) return _cloudFrontPrivateKey
  _cloudFrontPrivateKey = readCloudFrontPrivateKey()
  return _cloudFrontPrivateKey
}

export function getCloudFrontConfig() {
  return awsConfig.cloudFront
}

export function getBuckets() {
  return awsConfig.buckets
}



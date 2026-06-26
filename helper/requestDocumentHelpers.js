import { getDocumentSignedUrl } from './attachDocumentSignedUrls.js'

export const REQUEST_DOCUMENT_POPULATE = {
  path: 'requestDocument.document',
}

export function normalizeRequestDocumentEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    const name = entry.trim()
    return name ? { name, document: null } : null
  }
  if (typeof entry === 'object') {
    const name = (entry.name || '').trim()
    if (!name) return null
    const document =
      entry.document?._id || entry.document || entry.documentId || null
    return { name, document: document || null }
  }
  return null
}

export function normalizeRequestDocumentList(docs) {
  if (!Array.isArray(docs)) return []
  return docs.map(normalizeRequestDocumentEntry).filter(Boolean)
}

export function getRequestDocumentName(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return entry
  return entry.name || ''
}

export function applyRequestDocumentUpdate(product, body) {
  if (!product || !body) return

  if (body.fulfillRequestDocument) {
    const { index, name, document } = body.fulfillRequestDocument
    const docs = normalizeRequestDocumentList(product.requestDocument || [])
    const documentId = document?._id || document

    if (documentId == null) {
      delete body.fulfillRequestDocument
      return
    }

    let targetIndex = -1
    if (Number.isInteger(index) && index >= 0 && index < docs.length) {
      targetIndex = index
    } else if (name) {
      const normalizedName = String(name).trim().toLowerCase()
      targetIndex = docs.findIndex(
        (doc) => doc.name.trim().toLowerCase() === normalizedName,
      )
    }

    if (targetIndex >= 0) {
      docs[targetIndex].document = documentId
      body.requestDocument = docs

      const existingUploadIds = (product.uploadDocument || []).map((doc) =>
        doc?._id ? doc._id.toString() : doc?.toString(),
      )
      if (!existingUploadIds.includes(documentId.toString())) {
        body.uploadDocument = [
          ...(product.uploadDocument || []).map((doc) => doc._id || doc),
          documentId,
        ]
      }
    }

    delete body.fulfillRequestDocument
  }

  if (body.requestDocument) {
    const incoming = normalizeRequestDocumentList(body.requestDocument)
    const existing = normalizeRequestDocumentList(product.requestDocument || [])

    body.requestDocument = incoming.map((item) => {
      const match = existing.find(
        (entry) =>
          entry.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      )
      return {
        name: item.name,
        document: item.document || match?.document || null,
      }
    })
  }
}

export async function attachRequestDocumentSignedUrls(obj) {
  if (!obj?.requestDocument?.length) return

  await Promise.all(
    obj.requestDocument.map(async (entry) => {
      if (!entry?.document) return
      const signed = await getDocumentSignedUrl(entry.document)
      if (signed) {
        if (!entry.document.Certificate) entry.document.Certificate = {}
        entry.document.Certificate.url = signed
        entry.document.signedUrl = signed
      }
    }),
  )
}

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const s3 = new S3Client({ region: 'us-west-2' })
const BUCKET = process.env.S3_BUCKET || 'myol.daycrift.net-data'
const PRESIGNED_EXPIRY = 3600 // 1 hour

interface RequestBody {
	operation: 'list' | 'get' | 'put' | 'delete'
	key?: string
	contentType?: string
}

interface SongMeta {
	id: string
	key: string
	lastModified?: string
	size?: number
}

// CORS headers
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Content-Type': 'application/json'
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Handle CORS preflight
	if (event.httpMethod === 'OPTIONS') {
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: ''
		}
	}

	try {
		const body: RequestBody = JSON.parse(event.body || '{}')

		switch (body.operation) {
			case 'list':
				return await listSongs()

			case 'get':
				if (!body.key) {
					return errorResponse(400, 'Missing key parameter')
				}
				return await getPresignedUrl(body.key, 'get')

			case 'put':
				if (!body.key) {
					return errorResponse(400, 'Missing key parameter')
				}
				return await getPresignedUrl(body.key, 'put', body.contentType)

			case 'delete':
				if (!body.key) {
					return errorResponse(400, 'Missing key parameter')
				}
				return await deleteSong(body.key)

			default:
				return errorResponse(400, 'Invalid operation')
		}
	} catch (error) {
		console.error('Error:', error)
		return errorResponse(500, 'Internal server error')
	}
}

async function listSongs(): Promise<APIGatewayProxyResult> {
	const command = new ListObjectsV2Command({
		Bucket: BUCKET,
		Prefix: 'songs/',
		MaxKeys: 1000
	})

	const response = await s3.send(command)

	const songs: SongMeta[] = (response.Contents || [])
		.filter(obj => obj.Key?.endsWith('.cho'))
		.map(obj => {
			const key = obj.Key || ''
			const id = key.replace('songs/', '').replace('.cho', '')
			return {
				id,
				key,
				lastModified: obj.LastModified?.toISOString(),
				size: obj.Size
			}
		})

	return {
		statusCode: 200,
		headers: corsHeaders,
		body: JSON.stringify({ songs })
	}
}

async function getPresignedUrl(
	key: string,
	operation: 'get' | 'put',
	contentType?: string
): Promise<APIGatewayProxyResult> {
	// Ensure key has proper prefix
	const fullKey = key.startsWith('songs/') ? key : `songs/${key}`

	let command
	if (operation === 'get') {
		command = new GetObjectCommand({
			Bucket: BUCKET,
			Key: fullKey
		})
	} else {
		command = new PutObjectCommand({
			Bucket: BUCKET,
			Key: fullKey,
			ContentType: contentType || 'text/plain; charset=utf-8'
		})
	}

	const url = await getSignedUrl(s3, command, { expiresIn: PRESIGNED_EXPIRY })

	return {
		statusCode: 200,
		headers: corsHeaders,
		body: JSON.stringify({
			url,
			key: fullKey,
			expiresIn: PRESIGNED_EXPIRY
		})
	}
}

async function deleteSong(key: string): Promise<APIGatewayProxyResult> {
	const fullKey = key.startsWith('songs/') ? key : `songs/${key}`

	const command = new DeleteObjectCommand({
		Bucket: BUCKET,
		Key: fullKey
	})

	await s3.send(command)

	return {
		statusCode: 200,
		headers: corsHeaders,
		body: JSON.stringify({ success: true, key: fullKey })
	}
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
	return {
		statusCode,
		headers: corsHeaders,
		body: JSON.stringify({ error: message })
	}
}

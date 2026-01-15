/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AUTH_PASSWORD: string
	readonly VITE_S3_BUCKET: string
	readonly VITE_API_ENDPOINT: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

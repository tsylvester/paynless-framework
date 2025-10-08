import { createClient } from '@supabase/supabase-js'
import { readFile, readdir, stat } from 'fs/promises'
import { resolve, join, relative, extname } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.PROMPT_TEMPLATE_BUCKET ?? 'prompt-templates'
const PROMPTS_ROOT = resolve(process.cwd(), 'docs', 'prompts')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

type UploadItem = {
  filePath: string
  storagePath: string
  contentType: string
}

async function collectFiles(dir: string, prefix = ''): Promise<UploadItem[]> {
  const entries = await readdir(dir)
  const uploads: UploadItem[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = await stat(fullPath)
    const relPath = prefix ? `${prefix}/${entry}` : entry

    if (stats.isDirectory()) {
      uploads.push(...(await collectFiles(fullPath, relPath)))
    } else {
      const extension = extname(entry).toLowerCase()
      const contentType = extension === '.json'
        ? 'application/json'
        : extension === '.md'
          ? 'text/markdown'
          : 'application/octet-stream'
      uploads.push({ filePath: fullPath, storagePath: relPath, contentType })
    }
  }

  return uploads
}

async function main() {
  console.log(`Collecting prompt templates from ${PROMPTS_ROOT}`)
  const promptFiles = await collectFiles(PROMPTS_ROOT)

  const templatesRoot = resolve(process.cwd(), 'docs', 'templates')
  console.log(`Collecting document templates from ${templatesRoot}`)
  const templateFiles = await collectFiles(templatesRoot, 'templates')

  const files = [...promptFiles, ...templateFiles]

  if (files.length === 0) {
    console.warn('No files found to upload.')
    return
  }

  for (const { filePath, storagePath, contentType } of files) {
    const data = await readFile(filePath)
    const uploadPath = storagePath.replace(/\\/g, '/')
    console.log(`Uploading ${relative(process.cwd(), filePath)} -> ${uploadPath}`)

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(uploadPath, data, {
        upsert: true,
        contentType,
      })

    if (error) {
      console.error(`Failed to upload ${storagePath}:`, error.message)
      process.exitCode = 1
    }
  }

  console.log('Prompt template upload completed.')
}

main().catch((error) => {
  console.error('Unexpected error uploading prompt templates:', error)
  process.exit(1)
})

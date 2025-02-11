import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// Find all example folders
const examplesDir = path.resolve(__dirname, 'examples')
const exampleFolders = fs
  .readdirSync(examplesDir)
  .filter(
    (folder) =>
      fs.statSync(path.join(examplesDir, folder)).isDirectory() &&
      fs.existsSync(path.join(examplesDir, folder, 'index.html')),
  )

// Generate an index.html file with links
const indexHtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vite Examples</title>
</head>
<body>
    <h1>Vite Examples</h1>
    <ul>
        ${exampleFolders.map((folder) => `<li><a href="/examples/${folder}/">${folder}</a></li>`).join('')}
    </ul>
</body>
</html>
`

const isDev = process.env.NODE_ENV === 'development'

// Ensure the dist directory exists
const distDir = isDev ? path.resolve(__dirname, 'dist') : __dirname

if (isDev && !fs.existsSync(distDir)) {
  fs.mkdirSync(distDir)
}

// Write the generated index.html to the dist folder during development
fs.writeFileSync(path.resolve(distDir, 'index.html'), indexHtmlContent)

// Define Vite build inputs
const inputEntries: Record<string, string> = {
  main: path.resolve(distDir, 'index.html'), // Auto-generated main index
}

// Add each example folder's index.html as an entry point
exampleFolders.forEach((folder) => {
  inputEntries[folder] = path.join(examplesDir, folder, 'index.html')
})

export default defineConfig({
  build: {
    rollupOptions: {
      input: inputEntries,
    },
  },
  server: {
    open: '/dist/index.html',
  },
  resolve: {
    alias: {
      '@lib': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './examples/shared'),
    },
  },
})

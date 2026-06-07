const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, 'prisma', 'dev.db')

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
  console.log('Deleted prisma/dev.db')
} else {
  console.log('dev.db not found')
}

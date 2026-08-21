import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 4000)
const app = buildApp()

app.listen(port, () => {
  console.log(`chronoloop-backend listening on :${port}`)
})

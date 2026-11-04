import { defineApp } from 'convex/server'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import presence from '@convex-dev/presence/convex.config.js'

const app = defineApp()
app.use(rateLimiter)
app.use(presence)

export default app

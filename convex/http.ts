import { httpRouter } from 'convex/server'
import { auth } from './auth'

// Convex Auth registers HTTP endpoints (e.g. token exchange) on our deployment.
const http = httpRouter()
auth.addHttpRoutes(http)
export default http

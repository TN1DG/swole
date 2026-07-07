// Tells Convex which JWTs to trust. With Convex Auth, the deployment itself
// is the token issuer (CONVEX_SITE_URL is set automatically on the server).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
}

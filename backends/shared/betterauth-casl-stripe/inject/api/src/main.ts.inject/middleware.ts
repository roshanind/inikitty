// bodyParser is disabled above (see app-options) so @thallesp/nestjs-better-auth can read the
// raw request body for its own routes. Everything else needs JSON parsing restored, except the
// Stripe webhook — that needs its own raw body for signature verification (see
// billing.service.ts), so it gets express.raw() instead of express.json().
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl.startsWith('/auth')) {
    next();
    return;
  }
  if (req.originalUrl === '/billing/webhook') {
    raw({ type: 'application/json' })(req, res, next);
    return;
  }
  json()(req, res, next);
});

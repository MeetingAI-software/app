import { Router } from 'express';
import type { DocumentRepository } from '../../../ports/repositories.port';
import type { GenerateDocumentService } from '../../../application/generate-document.service';

/** Generation is synchronous by design today (~10-30s), so the POST needs headroom. */
const GENERATION_TIMEOUT_MS = 90_000;

export function createDocumentRoutes(
  documentRepo: DocumentRepository,
  generateDocumentService: GenerateDocumentService
): Router {
  const router = Router();

  // POST /api/meetings/:id/document  (+ ?regenerate=true)
  router.post('/api/meetings/:id/document', async (req, res, next) => {
    req.setTimeout(GENERATION_TIMEOUT_MS);
    res.setTimeout(GENERATION_TIMEOUT_MS);
    try {
      const regenerate = req.query.regenerate === 'true';
      const result = await generateDocumentService.generate(req.params.id, regenerate);
      return res
        .status(result.generated ? 201 : 200)
        .json({ document: { content: result.content, createdAt: result.createdAt } });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/meetings/:id/document
  router.get('/api/meetings/:id/document', async (req, res, next) => {
    try {
      const document = await documentRepo.getByMeetingId(req.params.id);
      if (!document) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }
      return res.status(200).json({ content: document.content, createdAt: document.createdAt });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

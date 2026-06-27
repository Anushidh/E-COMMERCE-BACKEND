import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { getReferralInfo } from '../controllers/referral.controller';

const router = Router();

router.use(authenticate);
router.get('/', getReferralInfo);

export default router;

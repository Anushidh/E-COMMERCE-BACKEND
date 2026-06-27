import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { getWallet, getWalletTransactions } from '../controllers/wallet.controller';

const router = Router();

router.use(authenticate);

router.get('/', getWallet);
router.get('/transactions', getWalletTransactions);

export default router;

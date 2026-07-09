import { Router } from 'express';
import { authenticate, userOnly } from '../middlewares/auth';
import { getWallet, getWalletTransactions, addMoney, verifyTopup } from '../controllers/wallet.controller';

const router = Router();

router.use(authenticate);
router.use(userOnly);

router.get('/', getWallet);
router.get('/transactions', getWalletTransactions);
router.post('/add-money', addMoney);
router.post('/verify-topup', verifyTopup);

export default router;

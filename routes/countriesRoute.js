import express from 'express';
import { GetAllCountriesData } from '../controller/countriesCtrl.js';

const router = express.Router();

router.get('/', GetAllCountriesData);


export default router;

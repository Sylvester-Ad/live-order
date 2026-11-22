import { Router } from "express";
import { z } from "zod";
import {
  createStoreSchema,
  storeResponseSchema,
  storesResponseSchema,
  updateStoreDetailsSchema,
} from "../lives/lives.schemas.js";
import {
  createStore,
  getStore,
  listStores,
  publishStore,
  unpublishStore,
  updateStoreDetails,
} from "../lives/lives.service.js";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  mobileMoneySettingsResponseSchema,
  updateMobileMoneySettingsSchema,
} from "../creators/mobile-money.schemas.js";
import {
  getStoreMobileMoneySettings,
  saveStoreMobileMoneySettings,
} from "../creators/mobile-money.service.js";

const router = Router();
const storeIdSchema = z.string().min(1);

router.get("/", requireCreator, async (req, res, next) => {
  try {
    const stores = await listStores(req.creator!.id);
    return res.json({ data: storesResponseSchema.parse(stores) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireCreator, async (req, res, next) => {
  try {
    const input = createStoreSchema.parse(req.body);
    const store = await createStore(req.creator!.id, input);
    return res.status(201).json({ data: storeResponseSchema.parse(store) });
  } catch (error) {
    next(error);
  }
});

router.get("/:storeId/mobile-money", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const settings = await getStoreMobileMoneySettings(req.creator!.id, storeId);
    return res.json({
      data: settings ? mobileMoneySettingsResponseSchema.parse(settings) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:storeId/mobile-money", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const input = updateMobileMoneySettingsSchema.parse(req.body);
    const settings = await saveStoreMobileMoneySettings(req.creator!.id, storeId, input);
    return res.json({ data: mobileMoneySettingsResponseSchema.parse(settings) });
  } catch (error) {
    next(error);
  }
});

router.get("/:storeId", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const store = await getStore(req.creator!.id, storeId);
    return res.json({ data: storeResponseSchema.parse(store) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:storeId", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const input = updateStoreDetailsSchema.parse(req.body);
    const store = await updateStoreDetails(req.creator!.id, storeId, input);
    return res.json({ data: storeResponseSchema.parse(store) });
  } catch (error) {
    next(error);
  }
});

router.post("/:storeId/publish", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const store = await publishStore(req.creator!.id, storeId);
    return res.json({ data: storeResponseSchema.parse(store) });
  } catch (error) {
    next(error);
  }
});

router.post("/:storeId/unpublish", requireCreator, async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const store = await unpublishStore(req.creator!.id, storeId);
    return res.json({ data: storeResponseSchema.parse(store) });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/topics — public, active topics only.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name_en, name_ar, name_he, education_level
       FROM topics WHERE active = true
       ORDER BY name_en`,
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        nameEn: r.name_en,
        nameAr: r.name_ar,
        nameHe: r.name_he,
        educationLevel: r.education_level,
      })),
    )
  } catch (err) {
    next(err)
  }
})

export default router

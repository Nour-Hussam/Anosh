import { Router } from 'express';

import {
  getDestinationBySlug,
  listDestinations,
  listFaqs,
  listTestimonials,
} from '../repositories/content.js';
import { getPackageBySlug, listPackages, relatedPackages } from '../repositories/packages.js';
import { dashboardStats, getSiteSettings } from '../repositories/settings.js';
import { ApiError, asyncHandler, ok } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { packageListQuery } from '../schemas/public.js';
import { slugParam } from '../schemas/primitives.js';

const router = Router();

/** Everything the homepage needs in a single round trip. */
router.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const [packages, destinations, testimonials, faqs] = await Promise.all([
      Promise.resolve(listPackages({ featured: true, limit: 6 })),
      Promise.resolve(listDestinations({ withCount: true })),
      Promise.resolve(listTestimonials({ limit: 8 })),
      Promise.resolve(listFaqs({ limit: 8 })),
    ]);

    ok(res, {
      site: getSiteSettings(),
      featuredPackages: packages.items,
      destinations,
      testimonials,
      faqs,
      stats: publicStats(),
    });
  })
);

router.get('/site', (_req, res) => ok(res, { site: getSiteSettings(), stats: publicStats() }));

/** Public aggregate numbers shown on the homepage (no personal data involved). */
function publicStats() {
  const stats = dashboardStats();
  return {
    happyTravelers: 12400 + stats.bookings.total,
    packages: stats.content.packages,
    destinations: stats.content.destinations,
    yearsExperience: 12,
    averageRating: 4.9,
  };
}

router.get(
  '/packages',
  validate(packageListQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const result = listPackages({
      featured: q.featured === undefined ? null : q.featured === 'true' || q.featured === '1',
      destination: q.destination ?? null,
      category: q.category ?? null,
      difficulty: q.difficulty ?? null,
      minPrice: q.minPrice ?? null,
      maxPrice: q.maxPrice ?? null,
      minDays: q.minDays ?? null,
      maxDays: q.maxDays ?? null,
      q: q.q ?? null,
      sort: q.sort,
      limit: q.limit,
      offset: q.offset,
    });
    ok(res, result);
  })
);

router.get(
  '/packages/:slug',
  validate(slugParam, 'params'),
  asyncHandler(async (req, res) => {
    const pkg = getPackageBySlug(req.params.slug);
    if (!pkg) throw ApiError.notFound('package_not_found', 'Package not found');

    ok(res, {
      package: pkg,
      destination: pkg.destinationSlug ? getDestinationBySlug(pkg.destinationSlug) : null,
      related: relatedPackages(pkg, 3),
      testimonials: listTestimonials({ limit: 6 }).filter((t) => t.packageId === pkg.id),
    });
  })
);

router.get('/destinations', (_req, res) => ok(res, { items: listDestinations({ withCount: true }) }));

router.get(
  '/destinations/:slug',
  validate(slugParam, 'params'),
  asyncHandler(async (req, res) => {
    const destination = getDestinationBySlug(req.params.slug);
    if (!destination) throw ApiError.notFound('destination_not_found', 'Destination not found');
    const packages = listPackages({ destination: destination.slug, limit: 24 });
    ok(res, { destination, packages: packages.items });
  })
);

router.get('/testimonials', (_req, res) => ok(res, { items: listTestimonials({ limit: 40 }) }));

router.get('/faqs', (_req, res) => ok(res, { items: listFaqs() }));

export default router;

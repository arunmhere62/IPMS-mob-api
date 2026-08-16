import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma, pg_locations_pg_type } from '@prisma/client';
import {
  findByPincode,
} from '@twin.techies/india-pincode';
import { lookupPincode } from 'india-post-pincode';

type PgWhereClause = Prisma.pg_locationsWhereInput;

interface ListingRow {
  s_no: number;
  location_name: string;
  address: string;
  pincode: string;
  pg_type: string;
  images: string | string[] | null;
  city_id: number;
  state_id: number;
  organization_id: number;
  slug: string;
  listing_description: string;
  listing_amenities: string | string[] | null;
  listing_contact_phone: string;
  listing_contact_email: string;
  latitude: string | number;
  longitude: string | number;
  is_featured: boolean | number;
  seo_title: string;
  seo_description: string;
  view_count: number;
  published_at: Date;
  city_name: string;
  state_name: string;
  min_price: number | null;
  available_beds: number;
  total_beds: number;
  distance_km: number;
}

export interface EnrichedListing {
  s_no: number;
  location_name: string;
  address: string;
  pincode: string;
  pg_type: string;
  images: string | string[] | null;
  city: { s_no: number; name: string } | { name: string } | null;
  state: { s_no: number; name: string } | { name: string } | null;
  slug: string | null;
  listing_description: string | null;
  listing_amenities: string | string[] | null;
  listing_contact_phone: string | null;
  listing_contact_email: string | null;
  latitude: number | null;
  longitude: number | null;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  view_count: number;
  published_at: Date | null;
  starting_price: number | null;
  available_beds: number;
  total_beds: number;
  distance_km?: number;
  rooms?: unknown[];
}

@Injectable()
export class PublicListingService {
  constructor(private prisma: PrismaService) {}

  /**
   * List published PGs with filters, pagination, and optional geo search
   */
  async listListings(params: {
    city?: string;
    cityId?: number;
    state?: string;
    area?: string;
    pincode?: string;
    pgType?: string;
    minPrice?: number;
    maxPrice?: number;
    lat?: number;
    lng?: number;
    radius?: number;
    sort?: string;
    page: number;
    limit: number;
  }) {
    const {
      city,
      cityId,
      state,
      area,
      pincode,
      pgType,
      minPrice,
      maxPrice,
      lat,
      lng,
      radius = 5,
      sort = 'newest',
      page,
      limit,
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause for pg_locations
    const pgWhere: PgWhereClause = {
      is_deleted: false,
      status: 'ACTIVE',
      pg_directory_listings: {
        listing_published: true,
      },
    };

    if (cityId) {
      pgWhere.city_id = cityId;
    } else if (city) {
      pgWhere.city = { name: { contains: city } };
    }

    if (state) {
      pgWhere.state = { name: { contains: state } };
    }

    if (area) {
      // Use pincode library to find the area's pincode, then get lat/lng
      // and filter PGs by geo-radius — no text fallback (avoids wrong results)
      let areaLat: number | undefined;
      let areaLng: number | undefined;

      try {
        // Get all PG pincodes in this city, then match the area name
        // against the post office names (same approach as listAreasByCity)
        const cityPgWhere: PgWhereClause = {
          is_deleted: false,
          status: 'ACTIVE',
          pg_directory_listings: { listing_published: true },
        };
        if (cityId) cityPgWhere.city_id = cityId;
        else if (city) cityPgWhere.city = { name: { contains: city } };

        const cityPgs = await this.prisma.pg_locations.findMany({
          where: cityPgWhere,
          select: { pincode: true },
          distinct: ['pincode'],
        });

        let areaPincode: string | undefined;
        for (const pg of cityPgs) {
          if (!pg.pincode) continue;
          const pin = pg.pincode.trim();
          if (pin.length !== 6) continue;
          const result = findByPincode(pin);
          if (!result || !result.offices) continue;
          // Check if any office name matches the requested area
          const matched = result.offices.some(
            (o: { name: string }) => o.name.toLowerCase() === area.toLowerCase(),
          );
          if (matched) {
            areaPincode = pin;
            break;
          }
        }

        // Get lat/lng for that pincode
        if (areaPincode) {
          const pincodeInfo = lookupPincode(areaPincode);
          if (pincodeInfo && pincodeInfo.latitude && pincodeInfo.longitude) {
            areaLat = Number(pincodeInfo.latitude);
            areaLng = Number(pincodeInfo.longitude);
          }
        }
      } catch {
        // ignore library errors
      }

      if (areaLat && areaLng) {
        // Use geo-radius filter (3km radius around the area center)
        const geoPgWhere: PgWhereClause = {
          is_deleted: false,
          status: 'ACTIVE',
          pg_directory_listings: { listing_published: true },
        };
        if (cityId) geoPgWhere.city_id = cityId;
        else if (city) geoPgWhere.city = { name: { contains: city } };
        if (state) geoPgWhere.state = { name: { contains: state } };
        if (pgType) geoPgWhere.pg_type = pgType as pg_locations_pg_type;

        return this.listWithGeoFilter(
          geoPgWhere,
          areaLat,
          areaLng,
          3, // 3km radius for area-level search
          sort || 'nearest',
          page,
          limit,
          (page - 1) * limit,
        );
      }

      // No lat/lng found — return empty results (no text fallback to avoid wrong results)
      return ResponseUtil.paginated(
        [],
        0,
        page,
        limit,
        'No PGs found in this area',
      );
    }

    if (pincode) {
      if (pincode.length >= 6) {
        pgWhere.pincode = pincode;
      } else {
        pgWhere.pincode = { startsWith: pincode };
      }
    }

    if (pgType) {
      pgWhere.pg_type = pgType as pg_locations_pg_type;
    }

    // Price filter — check if any bed has price in range
    if (minPrice !== undefined || maxPrice !== undefined) {
      const bedFilter: { gte?: number; lte?: number } = {};
      if (minPrice !== undefined) bedFilter.gte = minPrice;
      if (maxPrice !== undefined) bedFilter.lte = maxPrice;
      pgWhere.beds = {
        some: { bed_price: bedFilter, is_deleted: false },
      };
    }

    // Geo filter using Haversine formula (raw SQL for distance calc)
    if (lat !== undefined && lng !== undefined) {
      // We'll use raw SQL for geo queries since Prisma doesn't support Haversine
      return this.listWithGeoFilter(
        pgWhere,
        lat,
        lng,
        radius,
        sort,
        page,
        limit,
        skip,
      );
    }

    // Determine sort order
    let orderBy: Record<string, unknown> = { created_at: 'desc' }; // newest
    if (sort === 'price_low') {
      // Sort by min bed price — need to fetch and sort in app
      orderBy = { created_at: 'desc' };
    } else if (sort === 'featured') {
      orderBy = { pg_directory_listings: { is_featured: 'desc' } };
    }

    const [items, total] = await Promise.all([
      this.prisma.pg_locations.findMany({
        where: pgWhere,
        skip,
        take: limit,
        orderBy,
        select: this.getListingSelect(),
      }),
      this.prisma.pg_locations.count({ where: pgWhere }),
    ]);

    // Enrich with pricing + availability, then sort if needed
    const enriched = await this.enrichListings(items);

    if (sort === 'price_low') {
      enriched.sort((a, b) => (a.starting_price ?? 999999) - (b.starting_price ?? 999999));
    } else if (sort === 'price_high') {
      enriched.sort((a, b) => (b.starting_price ?? 0) - (a.starting_price ?? 0));
    }

    return ResponseUtil.paginated(
      enriched,
      total,
      page,
      limit,
      'PG listings fetched successfully',
    );
  }

  /**
   * Geo-filtered listing using raw SQL with Haversine formula
   */
  private async listWithGeoFilter(
    pgWhere: PgWhereClause,
    lat: number,
    lng: number,
    radius: number,
    sort: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    // Build the SQL conditions matching the Prisma where clause
    const conditions: string[] = [
      'pg.is_deleted = false',
      'pg.status = \'ACTIVE\'',
      'dl.listing_published = true',
      'dl.latitude IS NOT NULL',
      'dl.longitude IS NOT NULL',
    ];
    const params: (string | number)[] = [lat, lat, lng, radius];

    if (pgWhere.city_id) {
      conditions.push('pg.city_id = ?');
      params.push(pgWhere.city_id as number);
    }
    if (pgWhere.pincode) {
      if (typeof pgWhere.pincode === 'string') {
        conditions.push('pg.pincode = ?');
        params.push(pgWhere.pincode);
      } else if (pgWhere.pincode.startsWith) {
        conditions.push('pg.pincode LIKE ?');
        params.push(pgWhere.pincode.startsWith + '%');
      }
    }
    if (pgWhere.pg_type) {
      conditions.push('pg.pg_type = ?');
      params.push(pgWhere.pg_type as string);
    }

    const orderByClause =
      sort === 'price_low'
        ? 'ORDER BY min_price ASC, distance_km ASC'
        : sort === 'price_high'
          ? 'ORDER BY min_price DESC, distance_km ASC'
          : sort === 'featured'
            ? 'ORDER BY is_featured DESC, distance_km ASC'
            : 'ORDER BY distance_km ASC'; // default: nearest

    // Haversine placeholders: lat, lng, lat
    const geoParams: number[] = [lat, lng, lat];
    const conditionParams: (string | number)[] = params.slice(4);

    const sql = `
      SELECT *
      FROM (
        SELECT
          pg.s_no,
          pg.location_name,
          pg.address,
          pg.pincode,
          pg.pg_type,
          pg.images,
          pg.city_id,
          pg.state_id,
          pg.organization_id,
          dl.slug,
          dl.listing_description,
          dl.listing_amenities,
          dl.listing_contact_phone,
          dl.listing_contact_email,
          dl.latitude,
          dl.longitude,
          dl.is_featured,
          dl.seo_title,
          dl.seo_description,
          dl.view_count,
          dl.published_at,
          c.name as city_name,
          s.name as state_name,
          (
            SELECT MIN(b.bed_price) FROM beds b
            WHERE b.pg_id = pg.s_no AND b.is_deleted = false
          ) as min_price,
          (
            SELECT COUNT(*) FROM beds b
            LEFT JOIN tenant_allocations ta ON ta.bed_id = b.s_no
              AND (ta.effective_to IS NULL OR ta.effective_to >= NOW())
            WHERE b.pg_id = pg.s_no AND b.is_deleted = false AND ta.s_no IS NULL
          ) as available_beds,
          (
            SELECT COUNT(*) FROM beds b
            WHERE b.pg_id = pg.s_no AND b.is_deleted = false
          ) as total_beds,
          (6371 * acos(
            LEAST(GREATEST(
              cos(radians(?)) * cos(radians(dl.latitude)) *
              cos(radians(dl.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(dl.latitude)),
              -1
            ), 1)
          )) as distance_km
        FROM pg_locations pg
        INNER JOIN pg_directory_listings dl ON dl.pg_id = pg.s_no
        LEFT JOIN city c ON c.s_no = pg.city_id
        LEFT JOIN state s ON s.s_no = pg.state_id
        WHERE ${conditions.join(' AND ')}
      ) as sub
      WHERE distance_km <= ?
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const finalParams: (string | number)[] = [
      ...geoParams,
      ...conditionParams,
      radius,
      limit,
      skip,
    ];

    const rows: ListingRow[] = await this.prisma.$queryRawUnsafe(sql, ...finalParams);

    // Count total for pagination using the same distance calc
    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT pg.s_no,
          (6371 * acos(
            LEAST(GREATEST(
              cos(radians(?)) * cos(radians(dl.latitude)) *
              cos(radians(dl.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(dl.latitude)),
              -1
            ), 1)
          )) as distance_km
        FROM pg_locations pg
        INNER JOIN pg_directory_listings dl ON dl.pg_id = pg.s_no
        WHERE ${conditions.join(' AND ')}
      ) as sub
      WHERE distance_km <= ?
    `;
    const countParams: (string | number)[] = [lat, lng, lat, ...conditionParams, radius];
    const countResult: { total: number }[] = await this.prisma.$queryRawUnsafe(countSql, ...countParams);
    const total = Number(countResult[0]?.total ?? 0);

    // Format results
    const enriched = rows.map((row: ListingRow) => this.formatListingRow(row));

    return ResponseUtil.paginated(
      enriched,
      total,
      page,
      limit,
      'PG listings fetched successfully',
    );
  }

  /**
   * Get a single PG listing by ID (increments view count)
   */
  async getListingById(id: number, userLat?: number, userLng?: number) {
    const pg = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
        status: 'ACTIVE',
        pg_directory_listings: { listing_published: true },
      },
      select: {
        ...this.getListingSelect(),
        rooms: {
          where: { is_deleted: false },
          select: {
            s_no: true,
            room_no: true,
            images: true,
            beds: {
              where: { is_deleted: false },
              select: {
                s_no: true,
                bed_no: true,
                bed_price: true,
                images: true,
                tenant_allocations: {
                  where: {
                    OR: [
                      { effective_to: null },
                      { effective_to: { gte: new Date() } },
                    ],
                  },
                  select: { s_no: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!pg) {
      throw new NotFoundException('Listing not found or not published');
    }

    // Increment view count
    await this.prisma.pg_directory_listings.updateMany({
      where: { pg_id: id },
      data: { view_count: { increment: 1 } },
    });

    const enriched = (await this.enrichListings([pg]))[0] as EnrichedListing | undefined;

    // Compute distance if user coordinates are provided
    if (enriched && userLat != null && userLng != null) {
      const pgLat = enriched.latitude;
      const pgLng = enriched.longitude;
      if (pgLat != null && pgLng != null) {
        const distance = 6371 * Math.acos(
          Math.cos((userLat * Math.PI) / 180) * Math.cos((pgLat * Math.PI) / 180) *
          Math.cos((pgLng * Math.PI) / 180 - (userLng * Math.PI) / 180) +
          Math.sin((userLat * Math.PI) / 180) * Math.sin((pgLat * Math.PI) / 180)
        );
        enriched.distance_km = Number(distance.toFixed(2));
      }
    }

    // Add room/bed availability info
    if (enriched && enriched.rooms) {
      enriched.rooms = (enriched.rooms as Record<string, unknown>[]).map((room) => ({
        ...room,
        available_beds: (room.beds as Record<string, unknown>[]).filter(
          (b) => !b.tenant_allocations || (b.tenant_allocations as unknown[]).length === 0,
        ).length,
        total_beds: (room.beds as Record<string, unknown>[]).length,
        beds: (room.beds as Record<string, unknown>[]).map((b): Record<string, unknown> => ({
          ...b,
          is_occupied: b.tenant_allocations && (b.tenant_allocations as unknown[]).length > 0,
          tenant_allocations: undefined as unknown,
        })),
      }));
    }

    return ResponseUtil.success(enriched, 'PG listing fetched successfully');
  }

  /**
   * Get listing by slug (SEO-friendly URL)
   */
  async getListingBySlug(slug: string) {
    const listing = await this.prisma.pg_directory_listings.findFirst({
      where: { slug, listing_published: true },
      select: { pg_id: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return this.getListingById(listing.pg_id);
  }

  /**
   * List cities that have published PG listings
   */
  async listCities() {
    const cities = await this.prisma.city.findMany({
      where: {
        pg_locations: {
          some: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_directory_listings: { listing_published: true },
          },
        },
      },
      select: {
        s_no: true,
        name: true,
        _count: {
          select: {
            pg_locations: {
              where: {
                is_deleted: false,
                status: 'ACTIVE',
                pg_directory_listings: { listing_published: true },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = cities.map((c) => ({
      s_no: Number(c.s_no),
      name: c.name,
      pg_count: Number(c._count.pg_locations),
    }));

    return ResponseUtil.success(result, 'Cities fetched successfully');
  }

  /**
   * Get all published PG slugs (for sitemap generation)
   */
  async getAllPublishedSlugs() {
    const listings = await this.prisma.pg_locations.findMany({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        pg_directory_listings: { listing_published: true },
      },
      select: {
        s_no: true,
        pg_directory_listings: {
          select: { slug: true },
        },
      },
    });

    return listings.map((l) => ({
      s_no: l.s_no,
      slug: l.pg_directory_listings?.slug || null,
    }));
  }

  /**
   * Search PGs by name (autocomplete)
   */
  async searchListings(q: string, limit = 10) {
    if (!q || q.trim().length < 2) {
      return ResponseUtil.success([], 'Search query too short');
    }

    const results = await this.prisma.pg_locations.findMany({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        pg_directory_listings: { listing_published: true },
        OR: [
          { location_name: { contains: q.trim() } },
          { address: { contains: q.trim() } },
        ],
      },
      take: limit,
      select: {
        s_no: true,
        location_name: true,
        address: true,
        pg_directory_listings: { select: { slug: true } },
        city: { select: { name: true } },
      },
    });

    const formatted = results.map((r) => ({
      s_no: r.s_no,
      name: r.location_name,
      address: r.address,
      city: r.city?.name,
      slug: r.pg_directory_listings?.slug,
    }));

    return ResponseUtil.success(formatted, 'Search results fetched successfully');
  }

  /**
   * List cities with slugs for location-based landing pages
   */
  async listCitiesWithSlugs() {
    const cities = await this.prisma.city.findMany({
      where: {
        pg_locations: {
          some: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_directory_listings: { listing_published: true },
          },
        },
      },
      select: {
        s_no: true,
        name: true,
        _count: {
          select: {
            pg_locations: {
              where: {
                is_deleted: false,
                status: 'ACTIVE',
                pg_directory_listings: { listing_published: true },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = cities.map((c) => ({
      s_no: Number(c.s_no),
      name: c.name,
      slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      pg_count: Number(c._count.pg_locations),
    }));

    return ResponseUtil.success(result, 'Cities fetched successfully');
  }

  /**
   * Get city by slug
   */
  async getCityBySlug(slug: string) {
    const cities = await this.prisma.city.findMany({
      where: {
        pg_locations: {
          some: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_directory_listings: { listing_published: true },
          },
        },
      },
      select: {
        s_no: true,
        name: true,
      },
    });

    const city = cities.find(
      (c) =>
        c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ===
        slug,
    );

    return city || null;
  }

  /**
   * List popular areas within a city (extracted from PG addresses)
   */
  async listAreasByCity(cityId: number) {
    // Get city name
    const city = await this.prisma.city.findUnique({
      where: { s_no: cityId },
      select: { name: true },
    });
    if (!city) {
      return ResponseUtil.success([], 'City not found');
    }

    // Get all PGs in this city with their pincodes
    const pgs = await this.prisma.pg_locations.findMany({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        city_id: cityId,
        pg_directory_listings: { listing_published: true },
      },
      select: {
        pincode: true,
      },
    });

    // Use pincode library to derive area names
    const areaCounts = new Map<string, { count: number; pincode: string }>();
    for (const pg of pgs) {
      if (!pg.pincode) continue;
      const pin = pg.pincode.trim();
      if (pin.length !== 6) continue;
      const result = findByPincode(pin);
      if (!result || !result.offices || result.offices.length === 0) continue;
      // Use the first office name as the area name
      const areaName = result.offices[0].name;
      if (!areaName || areaName.length < 2) continue;
      const existing = areaCounts.get(areaName.toLowerCase());
      if (existing) {
        existing.count += 1;
      } else {
        areaCounts.set(areaName.toLowerCase(), { count: 1, pincode: pin });
      }
    }

    const result = Array.from(areaCounts.entries())
      .map(([key, val]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        slug: key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        pg_count: val.count,
        pincode: val.pincode,
      }))
      .sort((a, b) => b.pg_count - a.pg_count)
      .slice(0, 30); // Top 30 areas

    return ResponseUtil.success(result, 'Areas fetched successfully');
  }

  /**
   * Get all city+area combos for sitemap generation
   */
  async getAllLocationPages() {
    const cities = await this.prisma.city.findMany({
      where: {
        pg_locations: {
          some: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_directory_listings: { listing_published: true },
          },
        },
      },
      select: {
        s_no: true,
        name: true,
        pg_locations: {
          where: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_directory_listings: { listing_published: true },
          },
          select: { pincode: true },
        },
      },
    });

    const pages: { citySlug: string; areaSlug: string | null; areaName: string | null }[] = [];

    for (const city of cities) {
      const citySlug = city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // City-level page
      pages.push({ citySlug, areaSlug: null, areaName: null });

      // Area-level pages derived from pincode lookup
      const areaSet = new Set<string>();
      for (const pg of city.pg_locations) {
        if (!pg.pincode) continue;
        const pin = pg.pincode.trim();
        if (pin.length !== 6) continue;
        const result = findByPincode(pin);
        if (!result || !result.offices || result.offices.length === 0) continue;
        const areaName = result.offices[0].name;
        if (!areaName || areaName.length < 2) continue;
        const areaSlug = areaName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!areaSet.has(areaSlug)) {
          areaSet.add(areaSlug);
          pages.push({ citySlug, areaSlug, areaName });
        }
      }
    }

    return pages;
  }

  // ─── Helpers ───

  private getListingSelect() {
    return {
      s_no: true,
      location_name: true,
      address: true,
      pincode: true,
      pg_type: true,
      images: true,
      city_id: true,
      state_id: true,
      city: { select: { s_no: true, name: true } },
      state: { select: { s_no: true, name: true } },
      pg_directory_listings: {
        select: {
          slug: true,
          listing_description: true,
          listing_amenities: true,
          listing_contact_phone: true,
          listing_contact_email: true,
          latitude: true,
          longitude: true,
          is_featured: true,
          seo_title: true,
          seo_description: true,
          view_count: true,
          published_at: true,
        },
      },
    };
  }

  private async enrichListings(items: Record<string, unknown>[]): Promise<EnrichedListing[]> {
    if (!items.length) return [];

    const pgIds = items.map((i) => Number(i.s_no));

    // Fetch pricing + availability for all PGs in one query
    const bedsData = await this.prisma.beds.groupBy({
      by: ['pg_id'],
      where: { pg_id: { in: pgIds }, is_deleted: false },
      _min: { bed_price: true },
      _count: true,
    });

    // Fetch available beds (not allocated to active tenants)
    const allocations = await this.prisma.tenant_allocations.findMany({
      where: {
        beds: { pg_id: { in: pgIds }, is_deleted: false },
        OR: [
          { effective_to: null },
          { effective_to: { gte: new Date() } },
        ],
      },
      select: { bed_id: true },
    });
    const allocatedBedIds = new Set(allocations.map((a) => a.bed_id));

    const allBeds = await this.prisma.beds.findMany({
      where: { pg_id: { in: pgIds }, is_deleted: false },
      select: { s_no: true, pg_id: true, bed_price: true },
    });

    const priceMap = new Map<number, number>();
    const totalCountMap = new Map<number, number>();
    const availableCountMap = new Map<number, number>();

    for (const b of bedsData) {
      priceMap.set(b.pg_id, Number(b._min.bed_price ?? 0));
      totalCountMap.set(b.pg_id, b._count);
    }

    for (const b of allBeds) {
      if (!allocatedBedIds.has(b.s_no)) {
        availableCountMap.set(b.pg_id, (availableCountMap.get(b.pg_id) ?? 0) + 1);
      }
    }

    return items.map((item) => {
      const dl = item.pg_directory_listings as Record<string, unknown> | null;
      const sNo = Number(item.s_no);
      return {
        s_no: sNo,
        location_name: item.location_name as string,
        address: item.address as string,
        pincode: item.pincode as string,
        pg_type: item.pg_type as string,
        images: item.images as string | string[] | null,
        city: item.city as { s_no: number; name: string } | null,
        state: item.state as { s_no: number; name: string } | null,
        slug: dl?.slug as string | null,
        listing_description: dl?.listing_description as string | null,
        listing_amenities: dl?.listing_amenities as string | string[] | null,
        listing_contact_phone: dl?.listing_contact_phone as string | null,
        listing_contact_email: dl?.listing_contact_email as string | null,
        latitude: dl?.latitude ? Number(dl.latitude) : null,
        longitude: dl?.longitude ? Number(dl.longitude) : null,
        is_featured: (dl?.is_featured as boolean) ?? false,
        seo_title: dl?.seo_title as string | null,
        seo_description: dl?.seo_description as string | null,
        view_count: Number(dl?.view_count ?? 0),
        published_at: (dl?.published_at as Date | null) ?? null,
        starting_price: priceMap.get(sNo) ?? null,
        available_beds: availableCountMap.get(sNo) ?? 0,
        total_beds: totalCountMap.get(sNo) ?? 0,
      };
    });
  }

  private formatListingRow(row: ListingRow): EnrichedListing {
    let images = row.images;
    try {
      if (typeof images === 'string') images = JSON.parse(images);
    } catch {
      images = null;
    }

    let amenities = row.listing_amenities;
    try {
      if (typeof amenities === 'string') amenities = JSON.parse(amenities);
    } catch {
      amenities = null;
    }

    return {
      s_no: Number(row.s_no),
      location_name: row.location_name,
      address: row.address,
      pincode: row.pincode,
      pg_type: row.pg_type,
      images,
      city: row.city_name ? { name: row.city_name } : null,
      state: row.state_name ? { name: row.state_name } : null,
      slug: row.slug,
      listing_description: row.listing_description,
      listing_amenities: amenities,
      listing_contact_phone: row.listing_contact_phone,
      listing_contact_email: row.listing_contact_email,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      is_featured: Boolean(row.is_featured),
      seo_title: row.seo_title,
      seo_description: row.seo_description,
      view_count: Number(row.view_count ?? 0),
      published_at: row.published_at,
      starting_price: row.min_price ? Number(row.min_price) : null,
      available_beds: Number(row.available_beds ?? 0),
      total_beds: Number(row.total_beds ?? 0),
      distance_km: row.distance_km ? Number(Number(row.distance_km).toFixed(2)) : null,
    };
  }
}

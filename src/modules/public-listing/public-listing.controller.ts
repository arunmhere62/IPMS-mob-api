import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PublicListingService } from './public-listing.service';

@ApiTags('public-listings')
@Controller('public')
// No @UseGuards — these endpoints are public, no auth required
export class PublicListingController {
  constructor(private readonly listingService: PublicListingService) {}

  @Get('pg-listings')
  @ApiOperation({ summary: 'List published PGs with filters (public, no auth)' })
  @ApiQuery({ name: 'city', required: false, description: 'City name (partial match)' })
  @ApiQuery({ name: 'cityId', required: false, description: 'City ID' })
  @ApiQuery({ name: 'state', required: false, description: 'State name (partial match)' })
  @ApiQuery({ name: 'area', required: false, description: 'Area/address (partial match)' })
  @ApiQuery({ name: 'pincode', required: false, description: 'Pincode (exact or prefix)' })
  @ApiQuery({ name: 'pgType', required: false, enum: ['COLIVING', 'PG'] })
  @ApiQuery({ name: 'minPrice', required: false, description: 'Minimum bed price' })
  @ApiQuery({ name: 'maxPrice', required: false, description: 'Maximum bed price' })
  @ApiQuery({ name: 'lat', required: false, description: 'User latitude for "near me"' })
  @ApiQuery({ name: 'lng', required: false, description: 'User longitude for "near me"' })
  @ApiQuery({ name: 'radius', required: false, description: 'Search radius in km (default 5)' })
  @ApiQuery({ name: 'sort', required: false, enum: ['nearest', 'price_low', 'price_high', 'newest', 'featured'] })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default 20, max 50)' })
  @ApiResponse({
    status: 200,
    description: 'PG listings fetched successfully',
  })
  async listListings(
    @Query('city') city?: string,
    @Query('cityId') cityId?: string,
    @Query('state') state?: string,
    @Query('area') area?: string,
    @Query('pincode') pincode?: string,
    @Query('pgType') pgType?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Number(limit) || 20, 50);
    return this.listingService.listListings({
      city,
      cityId: cityId ? Number(cityId) : undefined,
      state,
      area,
      pincode,
      pgType,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      radius: radius ? Number(radius) : undefined,
      sort: sort || 'newest',
      page: Number(page) || 1,
      limit: parsedLimit,
    });
  }

  @Get('pg-listings/search')
  @ApiOperation({ summary: 'Search PGs by name (autocomplete, public)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default 10)' })
  async searchListings(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.listingService.searchListings(q, limit ? Number(limit) : 10);
  }

  @Get('pg-listings/slug/:slug')
  @ApiOperation({ summary: 'Get PG listing by slug (SEO-friendly URL, public)' })
  async getListingBySlug(@Param('slug') slug: string) {
    return this.listingService.getListingBySlug(slug);
  }

  @Get('pg-listings/:id')
  @ApiOperation({ summary: 'Get PG listing details by ID (public)' })
  @ApiQuery({ name: 'lat', required: false, description: 'User latitude for distance calculation' })
  @ApiQuery({ name: 'lng', required: false, description: 'User longitude for distance calculation' })
  async getListingById(
    @Param('id', ParseIntPipe) id: number,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.listingService.getListingById(
      id,
      lat ? Number(lat) : undefined,
      lng ? Number(lng) : undefined,
    );
  }

  @Get('cities')
  @ApiOperation({ summary: 'List cities with published PG listings (public)' })
  async listCities() {
    return this.listingService.listCities();
  }

  @Get('cities-with-slugs')
  @ApiOperation({ summary: 'List cities with URL slugs for location pages (public)' })
  async listCitiesWithSlugs() {
    return this.listingService.listCitiesWithSlugs();
  }

  @Get('areas/:cityId')
  @ApiOperation({ summary: 'List popular areas within a city (public)' })
  async listAreasByCity(@Param('cityId', ParseIntPipe) cityId: number) {
    return this.listingService.listAreasByCity(cityId);
  }

  @Get('location-pages')
  @ApiOperation({ summary: 'Get all city+area pages for sitemap (public)' })
  async getAllLocationPages() {
    return this.listingService.getAllLocationPages();
  }

  @Get('sitemap')
  @ApiOperation({ summary: 'Generate sitemap XML for published PG listings (public)' })
  @Header('Content-Type', 'application/xml')
  async getSitemap(@Res() res: Response, @Query('hostname') hostname?: string) {
    const base = hostname || 'https://www.indianpgmanagement.com';
    const listings = await this.listingService.getAllPublishedSlugs();
    const locationPages = await this.listingService.getAllLocationPages();

    const staticUrls = [
      { path: '/home', priority: '1.0', changefreq: 'daily' },
      { path: '/pg-directory', priority: '0.9', changefreq: 'daily' },
      { path: '/subscriptions', priority: '0.8', changefreq: 'weekly' },
      { path: '/about', priority: '0.7', changefreq: 'monthly' },
      { path: '/contact', priority: '0.7', changefreq: 'monthly' },
      { path: '/faq', priority: '0.6', changefreq: 'monthly' },
      { path: '/software-services', priority: '0.6', changefreq: 'monthly' },
      { path: '/terms', priority: '0.3', changefreq: 'yearly' },
      { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
      { path: '/refund-policy', priority: '0.3', changefreq: 'yearly' },
    ];

    const staticXml = staticUrls
      .map(
        (u) => `  <url>
    <loc>${base}${u.path}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
      )
      .join('\n');

    // Location landing pages (city + area)
    const locationXml = locationPages
      .map((p) => {
        const path = p.areaSlug
          ? `/pg-in-${p.citySlug}/${p.areaSlug}`
          : `/pg-in-${p.citySlug}`;
        return `  <url>
    <loc>${base}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${p.areaSlug ? '0.7' : '0.8'}</priority>
  </url>`;
      })
      .join('\n');

    const dynamicXml = listings
      .map(
        (l) => `  <url>
    <loc>${base}/pg-directory/${l.slug || l.s_no}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${locationXml}
${dynamicXml}
</urlset>`;

    res.send(xml);
  }
}

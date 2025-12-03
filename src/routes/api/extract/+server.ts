import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// @ts-ignore - extractors.js is a JS file
import { extractBranding } from '$lib/extractors.js';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Create a mock spinner that does nothing (we don't need CLI output)
const mockSpinner = {
	text: '',
	start: (text?: string) => { if (text) mockSpinner.text = text; return mockSpinner; },
	stop: () => mockSpinner,
	succeed: () => mockSpinner,
	fail: () => mockSpinner,
	warn: () => mockSpinner,
	info: () => mockSpinner
};

// Tech stack scanning (from ingredients)
interface IngredientCheck {
	tag: string;
	attribute: string | null;
	value: string | null;
}

interface HeaderCheck {
	header: string;
	value: string | null;
}

interface Ingredient {
	name: string;
	description: string;
	icon: string;
	checks: {
		tags: IngredientCheck[];
		headers: HeaderCheck[];
	};
}

interface TechMatch {
	id: string;
	name: string;
	description: string;
	icon: string;
}

async function scanTechStack(page: any, responseHeaders: Map<string, string>): Promise<{ matches: Record<string, TechMatch[]>; categories: Record<string, string> }> {
	const matches: Record<string, TechMatch[]> = {};

	// Get the ingredients directory path
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const ingredientsPath = join(__dirname, '..', '..', '..', 'lib', 'ingredients');

	let categories: Record<string, string> = {};
	try {
		const categoriesJson = readFileSync(join(ingredientsPath, 'categories.json'), 'utf-8');
		categories = JSON.parse(categoriesJson);
	} catch (e) {
		// Use inline categories if file not found
		categories = {
			"ads": "Ads",
			"analytics": "Analytics",
			"auth": "Authentication",
			"blogs": "Blogs",
			"builders": "Website Builders",
			"cdn": "CDNs",
			"cms": "CMS",
			"compliance": "Compliance",
			"docs": "Documentation Tools",
			"ecommerce": "E-Commerce",
			"fonts": "Fonts",
			"frameworks": "Frameworks",
			"hosts": "Hosts",
			"libraries": "Libraries",
			"monitoring": "Monitoring",
			"notifications": "Notifications",
			"payments": "Payments",
			"search": "Search",
			"security": "Security",
			"servers": "Servers",
			"social": "Social",
			"storage": "Storage",
			"widgets": "Widgets",
			"wikis": "Wikis",
			"other": "Other"
		};
	}

	// Scan HTML content in browser
	const htmlContent = await page.content();

	// Extract all script srcs, link hrefs, and meta tags for matching
	const scanData = await page.evaluate(() => {
		const data: {
			scripts: { src: string | null; content: string; id: string | null }[];
			links: { href: string | null; rel: string | null }[];
			metas: { name: string | null; content: string | null; property: string | null }[];
			allElements: { tag: string; attributes: Record<string, string>; text: string }[];
		} = {
			scripts: [],
			links: [],
			metas: [],
			allElements: []
		};

		// Scripts
		document.querySelectorAll('script').forEach((el) => {
			data.scripts.push({
				src: el.getAttribute('src'),
				content: el.textContent?.substring(0, 5000) || '',
				id: el.getAttribute('id')
			});
		});

		// Links
		document.querySelectorAll('link').forEach((el) => {
			data.links.push({
				href: el.getAttribute('href'),
				rel: el.getAttribute('rel')
			});
		});

		// Meta tags
		document.querySelectorAll('meta').forEach((el) => {
			data.metas.push({
				name: el.getAttribute('name'),
				content: el.getAttribute('content'),
				property: el.getAttribute('property')
			});
		});

		// Sample of elements for data-* attribute checks
		['main', 'div', 'body', 'html', 'header', 'footer', 'nav', 'section'].forEach(tagName => {
			document.querySelectorAll(tagName).forEach((el) => {
				const attrs: Record<string, string> = {};
				for (const attr of el.attributes) {
					attrs[attr.name] = attr.value;
				}
				data.allElements.push({
					tag: tagName,
					attributes: attrs,
					text: ''
				});
			});
		});

		return data;
	});

	// Check each category
	for (const category of Object.keys(categories)) {
		if (category === 'categories.json') continue;

		let ingredientFiles: string[] = [];
		try {
			ingredientFiles = readdirSync(join(ingredientsPath, category)).filter(f => f.endsWith('.json'));
		} catch (e) {
			continue;
		}

		for (const file of ingredientFiles) {
			try {
				const ingredientJson = readFileSync(join(ingredientsPath, category, file), 'utf-8');
				const ingredient: Ingredient = JSON.parse(ingredientJson);
				const ingredientId = file.replace('.json', '');

				let matched = false;

				// Check tags
				for (const tagCheck of ingredient.checks.tags) {
					if (matched) break;

					if (tagCheck.tag === 'script') {
						for (const script of scanData.scripts) {
							if (matched) break;

							// Check src attribute
							if (tagCheck.attribute === 'src' && script.src && tagCheck.value) {
								if (tagCheck.value.includes('*')) {
									const parts = tagCheck.value.split('*');
									if (parts.every(p => script.src!.includes(p))) {
										matched = true;
									}
								} else if (script.src.includes(tagCheck.value)) {
									matched = true;
								}
							}

							// Check id attribute
							if (tagCheck.attribute === 'id' && script.id && tagCheck.value) {
								if (script.id.includes(tagCheck.value)) {
									matched = true;
								}
							}

							// Check script content (attribute is null)
							if (tagCheck.attribute === null && tagCheck.value && script.content) {
								if (script.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					if (tagCheck.tag === 'link') {
						for (const link of scanData.links) {
							if (matched) break;
							if (tagCheck.attribute === 'href' && link.href && tagCheck.value) {
								if (tagCheck.value.includes('*')) {
									const parts = tagCheck.value.split('*');
									if (parts.every(p => link.href!.includes(p))) {
										matched = true;
									}
								} else if (link.href.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					if (tagCheck.tag === 'meta') {
						for (const meta of scanData.metas) {
							if (matched) break;
							// Generator meta tag
							if (meta.name === 'generator' && tagCheck.value && meta.content) {
								if (meta.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
							// Platform meta tag
							if (meta.name === 'platform' && tagCheck.value && meta.content) {
								if (meta.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					// Check other elements (main, div, etc.)
					if (['main', 'div', 'body', 'html', 'header', 'footer', 'nav', 'section'].includes(tagCheck.tag)) {
						for (const el of scanData.allElements) {
							if (matched) break;
							if (el.tag === tagCheck.tag && tagCheck.attribute && tagCheck.value) {
								const attrValue = el.attributes[tagCheck.attribute];
								if (attrValue && attrValue.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}
				}

				// Check headers
				for (const headerCheck of ingredient.checks.headers) {
					if (matched) break;
					const headerValue = responseHeaders.get(headerCheck.header.toLowerCase());
					if (headerValue) {
						if (headerCheck.value === null) {
							matched = true;
						} else if (headerValue.includes(headerCheck.value)) {
							matched = true;
						}
					}
				}

				// Also check raw HTML for additional patterns
				if (!matched) {
					for (const tagCheck of ingredient.checks.tags) {
						if (tagCheck.value && htmlContent.includes(tagCheck.value)) {
							// Only match if it's a strong indicator
							if (tagCheck.attribute === null || tagCheck.attribute === 'src' || tagCheck.attribute === 'href') {
								matched = true;
								break;
							}
						}
					}
				}

				if (matched) {
					if (!matches[category]) {
						matches[category] = [];
					}
					// Avoid duplicates
					if (!matches[category].some(m => m.id === ingredientId)) {
						matches[category].push({
							id: ingredientId,
							name: ingredient.name,
							description: ingredient.description,
							icon: ingredient.icon
						});
					}
				}
			} catch (e) {
				// Skip invalid ingredient files
			}
		}
	}

	return { matches, categories };
}

export const POST: RequestHandler = async ({ request }) => {
	let browser = null;

	try {
		const body = await request.json();
		const { url, options = {} } = body;

		if (!url) {
			return json({ error: 'URL is required' }, { status: 400 });
		}

		let targetUrl = url;
		if (!targetUrl.match(/^https?:\/\//)) {
			targetUrl = 'https://' + targetUrl;
		}

		try {
			new URL(targetUrl);
		} catch {
			return json({ error: 'Invalid URL format' }, { status: 400 });
		}

		// Launch browser with stealth args (same as dembrandt)
		browser = await chromium.launch({
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-blink-features=AutomationControlled',
				'--disable-web-security',
				'--disable-features=IsolateOrigins,site-per-process',
				'--disable-dev-shm-usage'
			]
		});

		// Create context with stealth settings
		const context = await browser.newContext({
			viewport: options.mobile ? { width: 375, height: 667 } : { width: 1920, height: 1080 },
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			locale: 'en-US'
		});

		// Stealth mode injections
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
			Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
			Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
			Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
			// @ts-ignore
			window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
			// @ts-ignore
			delete navigator.__proto__.webdriver;
		});

		const page = await context.newPage();

		// Capture response headers
		const responseHeaders = new Map<string, string>();
		page.on('response', (response) => {
			if (response.url() === targetUrl || response.url().replace(/\/$/, '') === targetUrl.replace(/\/$/, '')) {
				response.headers();
				for (const [key, value] of Object.entries(response.headers())) {
					responseHeaders.set(key.toLowerCase(), value);
				}
			}
		});

		// Use the actual dembrandt extraction function
		const result = await extractBranding(targetUrl, mockSpinner, browser, {
			navigationTimeout: 90000,
			darkMode: options.darkMode || false,
			mobile: options.mobile || false,
			slow: options.slow || false
		});

		// Get a fresh page for tech stack scanning (reuse the context)
		const scanPage = await context.newPage();
		await scanPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await scanPage.waitForTimeout(3000);

		// Scan for tech stack
		const techStack = await scanTechStack(scanPage, responseHeaders);

		await browser.close();
		browser = null;

		// Merge tech stack into result
		return json({
			...result,
			techStack: techStack.matches,
			techCategories: techStack.categories
		});

	} catch (error: any) {
		if (browser) {
			await browser.close();
		}
		console.error('Extraction error:', error);
		return json(
			{ error: error.message || 'Failed to extract design tokens' },
			{ status: 500 }
		);
	}
};

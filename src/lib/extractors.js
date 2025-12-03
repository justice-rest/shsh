/**
 * Brand Extraction Engine
 *
 * Core extraction logic with stealth mode, retry mechanisms, and parallel processing.
 * Handles bot detection, SPA hydration, and comprehensive design token extraction.
 */

import { chromium } from "playwright-core";
import chalk from "chalk";

/**
 * Main extraction function - orchestrates the entire brand analysis process
 *
 * @param {string} url - Target URL to analyze
 * @param {Object} spinner - Ora spinner instance for progress updates
 * @param {Object} passedBrowser - Optional pre-configured browser instance
 * @param {Object} options - Configuration options (navigationTimeout, etc.)
 * @returns {Object} Complete brand extraction data
 */
export async function extractBranding(
  url,
  spinner,
  passedBrowser = null,
  options = {}
) {
  const ownBrowser = !passedBrowser;
  let browser = passedBrowser;

  // Apply 3x timeout multiplier when --slow flag is enabled
  const timeoutMultiplier = options.slow ? 3 : 1;

  // Track timeouts for final report
  const timeouts = [];

  if (ownBrowser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-dev-shm-usage",
      ],
    });
  }

  spinner.text = "Creating browser context with stealth mode...";
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });

  // Full stealth — kills 99% of Cloudflare bot detection
  spinner.text = "Injecting anti-detection scripts...";

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });

    // Spoof Chrome runtime
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // Remove Playwright traces
    delete navigator.__proto__.webdriver;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  const page = await context.newPage();

  try {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      spinner.text = `Navigating to ${url} (attempt ${attempts}/${maxAttempts})...`;
      try {
        const initialUrl = url;

        // Try to resolve DNS first to give better error messages
        try {
          const urlObj = new URL(url);
          // This will throw if the URL is malformed
        } catch (urlErr) {
          throw new Error(`Invalid URL format: ${url}`);
        }

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: (options.navigationTimeout || 20000) * timeoutMultiplier,
        });
        const finalUrl = page.url();

        // Check for redirects or domain changes
        if (initialUrl !== finalUrl) {
          spinner.stop();
          const initialDomain = new URL(initialUrl).hostname;
          const finalDomain = new URL(finalUrl).hostname;

          if (initialDomain !== finalDomain) {
            console.log(
              chalk.hex('#FFB86C')(`  ⚠ Page redirected to different domain:`)
            );
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          } else {
            console.log(chalk.hex('#8BE9FD')(`  ℹ Page redirected within same domain:`));
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          }
          spinner.start();
        }

        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Page loaded`));

        // Give SPAs time to hydrate (Linear, Figma, Notion, etc.)
        spinner.start("Waiting for SPA hydration...");
        const hydrationTime = 8000 * timeoutMultiplier;
        await page.waitForTimeout(hydrationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Hydration complete (${hydrationTime/1000}s)`));

        // Optional: wait for main content
        spinner.start("Waiting for main content...");
        try {
          await page.waitForSelector("main, header, [data-hero], section", {
            timeout: 10000 * timeoutMultiplier,
          });
          spinner.stop();
          console.log(chalk.hex('#50FA7B')(`  ✓ Main content detected`));
        } catch {
          spinner.stop();
          console.log(chalk.hex('#FFB86C')(`  ⚠ Main content selector timeout (continuing)`));
          timeouts.push('Main content selector');
        }

        // Simulate human behavior
        spinner.start("Simulating human interaction...");
        await page.mouse.move(
          300 + Math.random() * 400,
          200 + Math.random() * 300
        );
        await page.evaluate(() => window.scrollTo(0, 400));
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Human behavior simulated`));

        // Final hydration wait
        spinner.start("Final content stabilization...");
        const stabilizationTime = 4000 * timeoutMultiplier;
        await page.waitForTimeout(stabilizationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Page fully loaded and stable`));

        spinner.start("Validating page content...");
        const contentLength = await page.evaluate(
          () => document.body.textContent.length
        );
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Content validated: ${contentLength} chars`));

        if (contentLength > 100) break;

        spinner.warn(
          `Page seems empty (attempt ${attempts}/${maxAttempts}), retrying...`
        );
        console.log(
          chalk.hex('#FFB86C')(
            `  ⚠ Content length: ${contentLength} chars (expected >100)`
          )
        );
        await page.waitForTimeout(3000 * timeoutMultiplier);
      } catch (err) {
        const errorMsg = err.message || '';

        // Enhanced error detection for DNS/network issues (GitHub issue #15)
        const isDnsError = errorMsg.includes('ERR_NAME_NOT_RESOLVED') ||
                          errorMsg.includes('ENOTFOUND') ||
                          errorMsg.includes('EAI_AGAIN') ||
                          errorMsg.includes('getaddrinfo');
        const isNetworkError = errorMsg.includes('ERR_CONNECTION_REFUSED') ||
                              errorMsg.includes('ERR_CONNECTION_RESET') ||
                              errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
                              errorMsg.includes('ECONNREFUSED') ||
                              errorMsg.includes('ETIMEDOUT') ||
                              errorMsg.includes('ECONNRESET');
        const isSslError = errorMsg.includes('ERR_CERT_') ||
                          errorMsg.includes('SSL_ERROR') ||
                          errorMsg.includes('CERT_');
        const isTimeoutError = errorMsg.includes('Timeout') ||
                              errorMsg.includes('timeout');

        // Provide user-friendly error messages
        let friendlyError = errorMsg;
        if (isDnsError) {
          friendlyError = `DNS resolution failed: The domain "${new URL(url).hostname}" could not be found. Please check the URL spelling and ensure the website exists.`;
        } else if (isNetworkError) {
          friendlyError = `Network error: Unable to connect to the server. The website may be down or blocking automated requests.`;
        } else if (isSslError) {
          friendlyError = `SSL/TLS certificate error: The website has an invalid or expired security certificate.`;
        } else if (isTimeoutError) {
          friendlyError = `Connection timeout: The website took too long to respond. It may be slow or experiencing high traffic.`;
        }

        if (attempts >= maxAttempts) {
          console.error(`  ↳ Failed after ${maxAttempts} attempts`);
          console.error(`  ↳ Last error: ${friendlyError}`);
          console.error(`  ↳ URL: ${url}`);
          // Throw with friendly error message
          const enhancedError = new Error(friendlyError);
          enhancedError.originalError = err;
          throw enhancedError;
        }
        spinner.warn(
          `Navigation failed (attempt ${attempts}/${maxAttempts}), retrying...`
        );
        console.log(`  ↳ Error: ${friendlyError}`);
        await page.waitForTimeout(3000 * timeoutMultiplier);
      }
    }

    spinner.stop();
    console.log(chalk.hex('#8BE9FD')("\n  Extracting design tokens...\n"));

    spinner.start("Extracting logo and favicons...");
    const { logo, favicons } = await extractLogo(page, url);
    spinner.stop();
    console.log(chalk.hex('#50FA7B')(`  ✓ Logo and favicons extracted`));

    spinner.start("Analyzing design system (15 parallel tasks)...");
    const [
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      buttons,
      inputs,
      links,
      breakpoints,
      iconSystem,
      frameworks,
      badges,
      forms,
      accessibility,
    ] = await Promise.all([
      extractColors(page),
      extractTypography(page),
      extractSpacing(page),
      extractBorderRadius(page),
      extractBorders(page),
      extractShadows(page),
      extractButtonStyles(page),
      extractInputStyles(page),
      extractLinkStyles(page),
      extractBreakpoints(page),
      detectIconSystem(page),
      detectFrameworks(page),
      extractBadgesAndTags(page),
      extractForms(page),
      extractAccessibilityAudit(page),
    ]);

    spinner.stop();
    console.log(colors.palette.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Colors: ${colors.palette.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Colors: 0 found`));
    console.log(typography.styles.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Typography: ${typography.styles.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Typography: 0 styles`));
    console.log(spacing.commonValues.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Spacing: ${spacing.commonValues.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Spacing: 0 values`));
    console.log(borderRadius.values.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Border radius: ${borderRadius.values.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Border radius: 0 values`));

    const bordersTotal = (borders?.widths?.length || 0) + (borders?.styles?.length || 0) + (borders?.colors?.length || 0);
    console.log(bordersTotal > 0 ?
      chalk.hex('#50FA7B')(`  ✓ Borders: ${borders?.widths?.length || 0} widths, ${borders?.styles?.length || 0} styles, ${borders?.colors?.length || 0} colors`) :
      chalk.hex('#FFB86C')(`  ⚠ Borders: 0 found`));

    console.log(shadows.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Shadows: ${shadows.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Shadows: 0 found`));
    console.log(buttons.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Buttons: ${buttons.length} variants`) : chalk.hex('#FFB86C')(`  ⚠ Buttons: 0 variants`));
    console.log(inputs.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Inputs: ${inputs.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Inputs: 0 styles`));
    console.log(links.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Links: ${links.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Links: 0 styles`));
    console.log(breakpoints.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Breakpoints: ${breakpoints.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Breakpoints: 0 detected`));
    console.log(iconSystem.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Icon systems: ${iconSystem.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Icon systems: 0 detected`));
    console.log(frameworks.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Frameworks: ${frameworks.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Frameworks: 0 detected`));
    console.log(badges.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Badges/Tags: ${badges.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Badges/Tags: 0 found`));
    console.log(forms.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Forms: ${forms.length} analyzed`) : chalk.hex('#FFB86C')(`  ⚠ Forms: 0 found`));
    console.log(accessibility.summary ? chalk.hex(accessibility.summary.passesMinimumAA ? '#50FA7B' : '#FFB86C')(`  ${accessibility.summary.passesMinimumAA ? '✓' : '⚠'} Accessibility: Score ${accessibility.summary.score}/100 (${accessibility.summary.errors} errors, ${accessibility.summary.warnings} warnings)`) : chalk.hex('#FFB86C')(`  ⚠ Accessibility: Not analyzed`));
    console.log();

    // Extract hover/focus state colors using actual interaction simulation
    spinner.start("Extracting hover/focus state colors...");
    const hoverFocusColors = [];

    // Helper: Split multi-value color strings (e.g., "rgb(0,0,0) rgb(255,255,255) rgb(28,105,212)")
    function splitMultiValueColors(colorValue) {
      if (!colorValue) return [];

      // Match all rgb/rgba/hsl/hsla/hex values in the string
      const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
      const matches = colorValue.match(colorRegex) || [colorValue];

      // Filter out invalid matches
      return matches.filter(c =>
        c !== 'transparent' &&
        c !== 'rgba(0, 0, 0, 0)' &&
        c !== 'rgba(0,0,0,0)' &&
        c.length > 3
      );
    }

    // Get all interactive elements
    const interactiveElements = await page.$$(`
      a,
      button,
      input,
      textarea,
      select,
      [role="button"],
      [role="link"],
      [role="tab"],
      [role="menuitem"],
      [role="switch"],
      [role="checkbox"],
      [role="radio"],
      [role="textbox"],
      [role="searchbox"],
      [role="combobox"],
      [aria-pressed],
      [aria-expanded],
      [aria-current],
      [tabindex]:not([tabindex="-1"])
    `);

    // Sample up to 20 elements for performance
    const sampled = interactiveElements.slice(0, 20);

    for (const element of sampled) {
      try {
        // Check if element is visible
        const isVisible = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 &&
                 rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        });

        if (!isVisible) continue;

        // Get initial state colors
        const beforeState = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor,
            tag: el.tagName.toLowerCase()
          };
        });

        // Hover over element
        await element.hover({ timeout: 1000 * timeoutMultiplier }).catch(() => {});
        await page.waitForTimeout(100 * timeoutMultiplier); // Wait for transitions

        // Get hover state colors
        const afterHover = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor
          };
        });

        // Compare and collect changed colors
        if (afterHover.color !== beforeState.color &&
            afterHover.color !== 'rgba(0, 0, 0, 0)' &&
            afterHover.color !== 'transparent') {
          hoverFocusColors.push({
            color: afterHover.color,
            property: 'color',
            state: 'hover',
            element: beforeState.tag
          });
        }

        if (afterHover.backgroundColor !== beforeState.backgroundColor &&
            afterHover.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            afterHover.backgroundColor !== 'transparent') {
          hoverFocusColors.push({
            color: afterHover.backgroundColor,
            property: 'background-color',
            state: 'hover',
            element: beforeState.tag
          });
        }

        if (afterHover.borderColor !== beforeState.borderColor) {
          // Split multi-value border colors
          const hoverBorderColors = splitMultiValueColors(afterHover.borderColor);
          const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);

          hoverBorderColors.forEach(color => {
            if (!beforeBorderColors.includes(color)) {
              hoverFocusColors.push({
                color: color,
                property: 'border-color',
                state: 'hover',
                element: beforeState.tag
              });
            }
          });
        }

        // Try focus for inputs/buttons
        if (['input', 'textarea', 'select', 'button'].includes(beforeState.tag)) {
          try {
            await element.focus({ timeout: 500 * timeoutMultiplier });
            await page.waitForTimeout(100 * timeoutMultiplier);

            const afterFocus = await element.evaluate(el => {
              const computed = getComputedStyle(el);
              return {
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                borderColor: computed.borderColor,
                outlineColor: computed.outlineColor
              };
            });

            // Check for focus-specific changes
            if (afterFocus.outlineColor &&
                afterFocus.outlineColor !== 'rgba(0, 0, 0, 0)' &&
                afterFocus.outlineColor !== 'transparent' &&
                afterFocus.outlineColor !== beforeState.color) {
              hoverFocusColors.push({
                color: afterFocus.outlineColor,
                property: 'outline-color',
                state: 'focus',
                element: beforeState.tag
              });
            }

            if (afterFocus.borderColor !== beforeState.borderColor &&
                afterFocus.borderColor !== afterHover.borderColor) {
              // Split multi-value border colors
              const focusBorderColors = splitMultiValueColors(afterFocus.borderColor);
              const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);

              focusBorderColors.forEach(color => {
                if (!beforeBorderColors.includes(color)) {
                  hoverFocusColors.push({
                    color: color,
                    property: 'border-color',
                    state: 'focus',
                    element: beforeState.tag
                  });
                }
              });
            }
          } catch (e) {
            // Focus might fail, continue
          }
        }

      } catch (e) {
        // Element might be stale or not interactable, continue
      }
    }

    // Move mouse away to reset hover states
    await page.mouse.move(0, 0).catch(() => {});

    // Merge hover/focus colors into palette
    hoverFocusColors.forEach(({ color }) => {
      const isDuplicate = colors.palette.some((c) => c.color === color);
      if (!isDuplicate && color) {
        // Normalize and add to palette
        const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        let normalized = color.toLowerCase();
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
          const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
          const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
          normalized = `#${r}${g}${b}`;
        }

        colors.palette.push({
          color,
          normalized,
          count: 1,
          confidence: "medium",
          sources: ["hover/focus"],
        });
      }
    });

    spinner.stop();
    console.log(hoverFocusColors.length > 0 ?
      chalk.hex('#50FA7B')(`  ✓ Hover/focus: ${hoverFocusColors.length} state colors found`) :
      chalk.hex('#FFB86C')(`  ⚠ Hover/focus: 0 state colors found`));

    // Extract additional colors from dark mode if requested
    if (options.darkMode) {
      spinner.start("Extracting dark mode colors...");

      // Try multiple methods to enable dark mode
      await page.evaluate(() => {
        // Method 1: Add data-theme attribute
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.setAttribute("data-mode", "dark");
        document.body.setAttribute("data-theme", "dark");

        // Method 2: Add dark mode classes
        document.documentElement.classList.add(
          "dark",
          "dark-mode",
          "theme-dark"
        );
        document.body.classList.add("dark", "dark-mode", "theme-dark");

        // Method 3: Trigger prefers-color-scheme media query
        // (Playwright can emulate this, but let's also try programmatically)
      });

      // Emulate prefers-color-scheme: dark
      await page.emulateMedia({ colorScheme: "dark" });

      // Wait for transitions to complete
      await page.waitForTimeout(500 * timeoutMultiplier);

      const darkModeColors = await extractColors(page);
      const darkModeButtons = await extractButtonStyles(page);
      const darkModeLinks = await extractLinkStyles(page);

      // Merge dark mode colors into main palette
      const mergedPalette = [...colors.palette];
      darkModeColors.palette.forEach((darkColor) => {
        // Check if this color is already in the palette using perceptual similarity
        const isDuplicate = mergedPalette.some((existingColor) => {
          // Simple check - could use delta-E here too
          return existingColor.normalized === darkColor.normalized;
        });

        if (!isDuplicate) {
          mergedPalette.push({ ...darkColor, source: "dark-mode" });
        }
      });

      colors.palette = mergedPalette;

      // Merge semantic colors
      Object.assign(colors.semantic, darkModeColors.semantic);

      // Merge dark mode buttons and links
      buttons.push(
        ...darkModeButtons.map((btn) => ({ ...btn, source: "dark-mode" }))
      );
      links.push(
        ...darkModeLinks.map((link) => ({ ...link, source: "dark-mode" }))
      );

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Dark mode: +${darkModeColors.palette.length} colors`));
    }

    // Extract additional colors from mobile viewport if requested
    if (options.mobile) {
      spinner.start("Extracting mobile viewport colors...");

      // Change viewport to mobile
      await page.setViewportSize({ width: 375, height: 667 });

      // Wait for responsive changes
      await page.waitForTimeout(500 * timeoutMultiplier);

      const mobileColors = await extractColors(page);

      // Merge mobile colors into main palette
      const mergedPalette = [...colors.palette];
      mobileColors.palette.forEach((mobileColor) => {
        const isDuplicate = mergedPalette.some((existingColor) => {
          return existingColor.normalized === mobileColor.normalized;
        });

        if (!isDuplicate) {
          mergedPalette.push({ ...mobileColor, source: "mobile" });
        }
      });

      colors.palette = mergedPalette;

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Mobile: +${mobileColors.palette.length} colors`));
    }

    spinner.stop();
    console.log();
    console.log(chalk.hex('#50FA7B').bold("✔ Brand extraction complete!"));

    // Report timeouts and suggest --slow if needed
    if (timeouts.length > 0 && !options.slow) {
      console.log();
      console.log(chalk.hex('#FFB86C')(`⚠ ${timeouts.length} timeout(s) occurred during extraction:`));
      timeouts.forEach(t => console.log(chalk.dim(`  • ${t}`)));
      console.log();
      console.log(chalk.hex('#8BE9FD')(`💡 Tip: Try running with ${chalk.bold('--slow')} flag for more reliable results on slow-loading sites`));
    }

    const result = {
      url: page.url(),
      extractedAt: new Date().toISOString(),
      logo,
      favicons,
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      components: { buttons, inputs, links, badges, forms },
      breakpoints,
      iconSystem,
      frameworks,
      accessibility,
    };

    // Detect canvas-only / WebGL sites (Tesla, Apple Vision Pro, etc.)
    const isCanvasOnly = await page.evaluate(() => {
      const canvases = document.querySelectorAll("canvas");
      const hasRealContent = document.body.textContent.trim().length > 200;
      const hasManyCanvases = canvases.length > 3;
      const hasWebGL = Array.from(canvases).some((c) => {
        const ctx = c.getContext("webgl") || c.getContext("webgl2");
        return !!ctx;
      });
      return hasManyCanvases && hasWebGL && !hasRealContent;
    });

    if (isCanvasOnly) {
      result.note =
        "This website uses canvas/WebGL rendering (e.g. Tesla, Apple Vision Pro). Design system cannot be extracted from DOM.";
      result.isCanvasOnly = true;
    }

    if (ownBrowser) await browser.close();

    return result;
  } catch (error) {
    if (ownBrowser) await browser.close();
    spinner.fail("Extraction failed");
    console.error(`  ↳ Error during extraction: ${error.message}`);
    console.error(`  ↳ URL: ${url}`);
    console.error(`  ↳ Stage: ${spinner.text || "unknown"}`);
    throw error;
  }
}

/**
 * Extract logo information from the page
 * Looks for common logo patterns: img with logo in class/id, SVG logos, etc.
 * Includes safe zone estimation and favicon detection
 */
async function extractLogo(page, url) {
  return await page.evaluate((baseUrl) => {
    // Find logo - check img, svg, and svg elements containing <use> with logo references
    const candidates = Array.from(document.querySelectorAll("img, svg")).filter(
      (el) => {
        const className =
          typeof el.className === "string"
            ? el.className
            : el.className.baseVal || "";
        const attrs = (
          className +
          " " +
          (el.id || "") +
          " " +
          (el.getAttribute("alt") || "")
        ).toLowerCase();

        // Check element's own attributes
        if (attrs.includes("logo") || attrs.includes("brand")) {
          return true;
        }

        // For SVG elements, also check <use> children for logo references
        if (el.tagName === "svg" || el.tagName === "SVG") {
          const useElements = el.querySelectorAll("use");
          for (const use of useElements) {
            const href =
              use.getAttribute("href") || use.getAttribute("xlink:href") || "";
            if (
              href.toLowerCase().includes("logo") ||
              href.toLowerCase().includes("brand")
            ) {
              return true;
            }
          }
        }

        return false;
      }
    );

    let logoData = null;
    if (candidates.length > 0) {
      const logo = candidates[0];
      const computed = window.getComputedStyle(logo);
      const parent = logo.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;

      // Calculate safe zone from padding and margins
      const safeZone = {
        top:
          parseFloat(computed.marginTop) +
          (parentComputed ? parseFloat(parentComputed.paddingTop) : 0),
        right:
          parseFloat(computed.marginRight) +
          (parentComputed ? parseFloat(parentComputed.paddingRight) : 0),
        bottom:
          parseFloat(computed.marginBottom) +
          (parentComputed ? parseFloat(parentComputed.paddingBottom) : 0),
        left:
          parseFloat(computed.marginLeft) +
          (parentComputed ? parseFloat(parentComputed.paddingLeft) : 0),
      };

      if (logo.tagName === "IMG") {
        logoData = {
          source: "img",
          url: new URL(logo.src, baseUrl).href,
          width: logo.naturalWidth || logo.width,
          height: logo.naturalHeight || logo.height,
          alt: logo.alt,
          safeZone: safeZone,
        };
      } else {
        // SVG logo - try to get the parent link or closest anchor
        const parentLink = logo.closest("a");
        logoData = {
          source: "svg",
          url: parentLink ? parentLink.href : window.location.href,
          width: logo.width?.baseVal?.value,
          height: logo.height?.baseVal?.value,
          safeZone: safeZone,
        };
      }
    }

    // Extract all favicons
    const favicons = [];

    // Standard favicons
    document.querySelectorAll('link[rel*="icon"]').forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        favicons.push({
          type: link.getAttribute("rel"),
          url: new URL(href, baseUrl).href,
          sizes: link.getAttribute("sizes") || null,
        });
      }
    });

    // Apple touch icons
    document
      .querySelectorAll('link[rel="apple-touch-icon"]')
      .forEach((link) => {
        const href = link.getAttribute("href");
        if (href) {
          favicons.push({
            type: "apple-touch-icon",
            url: new URL(href, baseUrl).href,
            sizes: link.getAttribute("sizes") || null,
          });
        }
      });

    // Open Graph image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const content = ogImage.getAttribute("content");
      if (content) {
        favicons.push({
          type: "og:image",
          url: new URL(content, baseUrl).href,
          sizes: null,
        });
      }
    }

    // Twitter card image
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) {
      const content = twitterImage.getAttribute("content");
      if (content) {
        favicons.push({
          type: "twitter:image",
          url: new URL(content, baseUrl).href,
          sizes: null,
        });
      }
    }

    // Check for default /favicon.ico if not already included
    const hasFaviconIco = favicons.some((f) => f.url.endsWith("/favicon.ico"));
    if (!hasFaviconIco) {
      favicons.push({
        type: "favicon.ico",
        url: new URL("/favicon.ico", baseUrl).href,
        sizes: null,
      });
    }

    return {
      logo: logoData,
      favicons: favicons,
    };
  }, url);
}

/**
 * Extract color palette with confidence scoring
 * Analyzes semantic colors, CSS variables, gradients, and visual frequency
 */
async function extractColors(page) {
  return await page.evaluate(() => {
    // Helper: Convert any color to normalized hex for deduplication
    function normalizeColor(color) {
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      // Handle HSL
      const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?/);
      if (hslMatch) {
        const h = parseInt(hslMatch[1]);
        const s = parseInt(hslMatch[2]) / 100;
        const l = parseInt(hslMatch[3]) / 100;
        // HSL to RGB conversion
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
      return color.toLowerCase();
    }

    // Helper: Check if value is a valid simple color (not calc/clamp/var)
    function isValidColorValue(value) {
      if (!value) return false;
      // Reject CSS functions unless they contain actual color values
      if (
        value.includes("calc(") ||
        value.includes("clamp(") ||
        value.includes("var(")
      ) {
        // Only accept if it contains rgb/hsl/# inside
        return /#[0-9a-f]{3,6}|rgba?\(|hsla?\(/i.test(value);
      }
      // Accept hex, rgb, hsl, named colors
      return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+)/i.test(value);
    }

    // Helper: Extract colors from gradients
    function extractGradientColors(gradient) {
      const colors = [];
      const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
      const matches = gradient.match(colorRegex) || [];
      matches.forEach(c => {
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
          colors.push(c);
        }
      });
      return colors;
    }

    const colorMap = new Map(); // Normalized color -> original representations
    const semanticColors = {};
    const cssVariables = {};
    const gradients = [];

    // Extract ALL CSS variables comprehensively
    const styles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);
    const domain = window.location.hostname;

    // Also check for CSS variables from stylesheets
    const allCssVars = new Map();

    // Get variables from computed styles
    const collectVars = (computedStyle, source) => {
      for (let i = 0; i < computedStyle.length; i++) {
        const prop = computedStyle[i];
        if (prop.startsWith("--")) {
          const value = computedStyle.getPropertyValue(prop).trim();
          if (value && !allCssVars.has(prop)) {
            allCssVars.set(prop, { value, source });
          }
        }
      }
    };

    collectVars(styles, 'root');
    collectVars(bodyStyles, 'body');

    // Also scan stylesheets for CSS variables
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--')) {
                  const value = rule.style.getPropertyValue(prop).trim();
                  if (value && !allCssVars.has(prop)) {
                    allCssVars.set(prop, { value, source: 'stylesheet' });
                  }
                }
              }
            }
          }
        } catch (e) {
          // Cross-origin
        }
      }
    } catch (e) {}

    // Now filter and categorize
    for (const [prop, { value }] of allCssVars) {
      // Skip WordPress presets (they're almost never customized)
      if (prop.startsWith("--wp--preset")) {
        continue;
      }

      // Skip obvious system/default variables
      if (prop.includes("--system-") || prop.includes("--default-")) {
        continue;
      }

      // Skip cookie consent unless it's a cookie consent domain
      if (
        prop.includes("--cc-") &&
        !domain.includes("cookie") &&
        !domain.includes("consent")
      ) {
        continue;
      }

      // Skip SCSS functions and invalid values
      if (
        value.includes("color.adjust(") ||
        value.includes("rgba(0, 0, 0, 0)") ||
        value.includes("rgba(0,0,0,0)") ||
        value.includes("lighten(") ||
        value.includes("darken(") ||
        value.includes("saturate(")
      ) {
        continue;
      }

      // Include ALL CSS variables, not just colors
      // But still validate color values if they look like colors
      if (isValidColorValue(value) || !value.includes('(')) {
        cssVariables[prop] = value;
      }
    }

    // Count total visible elements for threshold calculation
    const elements = document.querySelectorAll("*");
    const totalElements = elements.length;

    const contextScores = {
      logo: 5,
      brand: 5,
      primary: 4,
      cta: 4,
      hero: 3,
      button: 3,
      link: 2,
      header: 2,
      nav: 1,
    };

    elements.forEach((el) => {
      // Skip hidden elements
      const computed = getComputedStyle(el);
      if (
        computed.display === "none" ||
        computed.visibility === "hidden" ||
        computed.opacity === "0"
      ) {
        return;
      }

      const bgColor = computed.backgroundColor;
      const textColor = computed.color;
      const borderColor = computed.borderColor;
      const outlineColor = computed.outlineColor;
      const caretColor = computed.caretColor;
      const textDecorationColor = computed.textDecorationColor;
      const backgroundImage = computed.backgroundImage;
      const boxShadow = computed.boxShadow;
      const fill = computed.fill;
      const stroke = computed.stroke;

      // Extract gradient colors
      if (backgroundImage && backgroundImage.includes('gradient')) {
        const gradientColors = extractGradientColors(backgroundImage);
        if (gradientColors.length > 0 && !gradients.some(g => g.value === backgroundImage)) {
          gradients.push({
            value: backgroundImage,
            colors: gradientColors,
            type: backgroundImage.includes('linear') ? 'linear' : backgroundImage.includes('radial') ? 'radial' : 'conic'
          });
        }
      }

      // Extract shadow colors
      if (boxShadow && boxShadow !== 'none') {
        const shadowColors = extractGradientColors(boxShadow);
        shadowColors.forEach(color => {
          const normalized = normalizeColor(color);
          const existing = colorMap.get(normalized) || {
            original: color,
            count: 0,
            score: 0,
            sources: new Set(),
          };
          existing.count++;
          existing.score += 1;
          existing.sources.add('shadow');
          colorMap.set(normalized, existing);
        });
      }

      // Build comprehensive context string including data attributes
      const context = (
        el.className + " " +
        el.id + " " +
        (el.getAttribute('data-tracking-linkid') || '') + " " +
        (el.getAttribute('data-cta') || '') + " " +
        (el.getAttribute('data-component') || '') + " " +
        el.tagName
      ).toLowerCase();

      let score = 1;

      // Check for semantic context keywords
      for (const [keyword, weight] of Object.entries(contextScores)) {
        if (context.includes(keyword)) score = Math.max(score, weight);
      }

      // Extra boost for colored buttons (non-transparent, non-white, non-black backgrounds)
      if ((context.includes('button') || context.includes('btn') || context.includes('cta')) &&
          bgColor &&
          bgColor !== 'rgba(0, 0, 0, 0)' &&
          bgColor !== 'transparent' &&
          bgColor !== 'rgb(255, 255, 255)' &&
          bgColor !== 'rgb(0, 0, 0)' &&
          bgColor !== 'rgb(239, 239, 239)') { // Also skip very light gray
        score = Math.max(score, 25); // Colored buttons get HIGH confidence (>20)
      }

      // Helper: Split multi-value color strings (e.g., "rgb(0,0,0) rgb(255,255,255) rgb(28,105,212)")
      function extractColorsFromValue(colorValue) {
        if (!colorValue) return [];

        // Match all rgb/rgba/hsl/hsla/hex values in the string
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)/gi;
        const matches = colorValue.match(colorRegex) || [];

        // Filter out invalid matches
        return matches.filter(c =>
          c !== 'transparent' &&
          c !== 'rgba(0, 0, 0, 0)' &&
          c !== 'rgba(0,0,0,0)' &&
          c.length > 2
        );
      }

      // Collect all colors from this element (comprehensive)
      const allColors = [
        ...extractColorsFromValue(bgColor),
        ...extractColorsFromValue(textColor),
        ...extractColorsFromValue(borderColor),
        ...extractColorsFromValue(outlineColor),
        ...extractColorsFromValue(caretColor),
        ...extractColorsFromValue(textDecorationColor),
        ...extractColorsFromValue(fill),
        ...extractColorsFromValue(stroke)
      ];

      allColors.forEach((color) => {
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
          const normalized = normalizeColor(color);
          const existing = colorMap.get(normalized) || {
            original: color, // Keep first seen format
            count: 0,
            score: 0,
            sources: new Set(),
          };
          existing.count++;
          existing.score += score;
          if (score > 1) {
            const source = context.split(" ")[0].substring(0, 30); // Limit source length
            if (source && !source.includes("__")) {
              // Skip auto-generated class names
              existing.sources.add(source);
            }
          }
          colorMap.set(normalized, existing);
        }
      });

      // Semantic color detection
      if (context.includes("primary") || el.matches('[class*="primary"]')) {
        semanticColors.primary =
          bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent"
            ? bgColor
            : textColor;
      }
      if (context.includes("secondary")) {
        semanticColors.secondary = bgColor;
      }
    });

    // Calculate threshold: 1% of elements or minimum 3 occurrences
    const threshold = Math.max(3, Math.floor(totalElements * 0.01));

    // Helper: Check if a color is "structural" (used on >40% of elements)
    // Only filter blacks/whites/grays if they're clearly just scaffolding
    function isStructuralColor(data, totalElements) {
      const usagePercent = (data.count / totalElements) * 100;
      const normalized = normalizeColor(data.original);

      // Pure transparent - always structural
      if (
        data.original === "rgba(0, 0, 0, 0)" ||
        data.original === "transparent"
      ) {
        return true;
      }

      // If a color is used on >40% of elements AND has very low semantic score, it's structural
      if (usagePercent > 40 && data.score < data.count * 1.2) {
        return true;
      }

      return false;
    }

    // Helper: Calculate delta-E color distance (simplified CIE76)
    function deltaE(rgb1, rgb2) {
      // Convert hex to RGB if needed
      function hexToRgb(hex) {
        if (!hex.startsWith("#")) return null;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : null;
      }

      const c1 = hexToRgb(rgb1);
      const c2 = hexToRgb(rgb2);

      if (!c1 || !c2) return 999; // Very different if can't parse

      // Simple RGB distance (not true delta-E but good enough)
      const rDiff = c1.r - c2.r;
      const gDiff = c1.g - c2.g;
      const bDiff = c1.b - c2.b;

      return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    }

    const palette = Array.from(colorMap.entries())
      .filter(([normalizedColor, data]) => {
        // Filter out colors below threshold
        if (data.count < threshold) return false;

        // Filter out structural colors (very high usage without semantic context)
        if (isStructuralColor(data, totalElements)) {
          return false;
        }

        return true;
      })
      .map(([normalizedColor, data]) => ({
        color: data.original,
        normalized: normalizedColor,
        count: data.count,
        confidence:
          data.score > 20 ? "high" : data.score > 5 ? "medium" : "low",
        sources: Array.from(data.sources).slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count);

    // Apply perceptual deduplication using delta-E
    // Merge colors that are visually very similar (delta-E < 15)
    const perceptuallyDeduped = [];
    const merged = new Set();

    palette.forEach((color, index) => {
      if (merged.has(index)) return;

      // Find all similar colors
      const similar = [color];
      for (let i = index + 1; i < palette.length; i++) {
        if (merged.has(i)) continue;

        const distance = deltaE(color.normalized, palette[i].normalized);
        if (distance < 15) {
          // Threshold for "visually similar"
          similar.push(palette[i]);
          merged.add(i);
        }
      }

      // Keep the one with highest count (most common variant)
      const best = similar.sort((a, b) => b.count - a.count)[0];
      perceptuallyDeduped.push(best);
    });

    // Deduplicate and filter CSS variables
    const paletteNormalizedColors = new Set(
      perceptuallyDeduped.map((c) => c.normalized)
    );
    const cssVarsByColor = new Map(); // normalized color -> variable names

    Object.entries(cssVariables).forEach(([prop, value]) => {
      const normalized = normalizeColor(value);

      // Skip if this color is already in the palette
      if (paletteNormalizedColors.has(normalized)) {
        return;
      }

      // Apply perceptual deduplication to CSS variables too
      let isDuplicate = false;
      for (const paletteColor of perceptuallyDeduped) {
        if (deltaE(normalized, paletteColor.normalized) < 15) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) return;

      if (!cssVarsByColor.has(normalized)) {
        cssVarsByColor.set(normalized, { value, vars: [] });
      }
      cssVarsByColor.get(normalized).vars.push(prop);
    });

    // Convert back to object with deduplicated values
    const filteredCssVariables = {};
    cssVarsByColor.forEach(({ value, vars }) => {
      // Only show first variable name if multiple have same value
      filteredCssVariables[vars[0]] = value;
    });

    return {
      semantic: semanticColors,
      palette: perceptuallyDeduped,
      cssVariables: filteredCssVariables,
      gradients: gradients.slice(0, 10),
    };
  });
}

async function extractTypography(page) {
  return await page.evaluate(() => {
    const seen = new Map();
    const sources = {
      googleFonts: [],
      adobeFonts: false,
      bunnyFonts: [],
      fontshare: [],
      selfHosted: [],
      systemFonts: [],
      variableFonts: new Set(),
    };

    // ——— Font sources ———

    // 1. Google Fonts
    document
      .querySelectorAll(
        'link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'
      )
      .forEach((l) => {
        const matches = l.href.match(/family=([^&:%]+)/g) || [];
        matches.forEach((m) => {
          const name = decodeURIComponent(
            m.replace("family=", "").split(":")[0]
          ).replace(/\+/g, " ");
          if (!sources.googleFonts.includes(name))
            sources.googleFonts.push(name);
          if (l.href.includes("wght") || l.href.includes("ital"))
            sources.variableFonts.add(name);
        });
      });

    // 2. Adobe Fonts (Typekit)
    if (
      document.querySelector(
        'link[href*="typekit.net"], script[src*="use.typekit.net"]'
      )
    ) {
      sources.adobeFonts = true;
    }

    // 3. Bunny Fonts (privacy-focused Google Fonts alternative)
    document
      .querySelectorAll('link[href*="fonts.bunny.net"]')
      .forEach((l) => {
        const matches = l.href.match(/family=([^&:%]+)/g) || [];
        matches.forEach((m) => {
          const name = decodeURIComponent(
            m.replace("family=", "").split(":")[0]
          ).replace(/\+/g, " ");
          if (!sources.bunnyFonts.includes(name))
            sources.bunnyFonts.push(name);
          if (l.href.includes("wght") || l.href.includes("ital"))
            sources.variableFonts.add(name);
        });
      });

    // 4. Fontshare
    document
      .querySelectorAll('link[href*="api.fontshare.com"], link[href*="fontshare.com"]')
      .forEach((l) => {
        // Fontshare uses different URL patterns
        const fontMatch = l.href.match(/fonts?=([^&]+)/i);
        if (fontMatch) {
          const fonts = fontMatch[1].split(',');
          fonts.forEach(f => {
            const name = decodeURIComponent(f.split('@')[0].split(':')[0]).replace(/-/g, ' ');
            if (name && !sources.fontshare.includes(name)) {
              sources.fontshare.push(name);
            }
          });
        }
      });

    // 5. rsms.me/inter (Inter font)
    if (document.querySelector('link[href*="rsms.me/inter"]')) {
      if (!sources.selfHosted.some(f => f.name === 'Inter')) {
        sources.selfHosted.push({ name: 'Inter', source: 'rsms.me' });
      }
      sources.variableFonts.add('Inter');
    }

    // 6. fonts.com
    if (document.querySelector('link[href*="fast.fonts.net"], script[src*="fast.fonts.net"]')) {
      sources.fontscom = true;
    }

    // 7. Self-hosted fonts via @font-face
    let fontDisplay = null;
    const fontFaceDeclarations = [];
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const family = rule.style.fontFamily?.replace(/['"]/g, '');
              const display = rule.style.fontDisplay;
              const src = rule.style.src || '';
              const weight = rule.style.fontWeight;
              const style = rule.style.fontStyle;

              if (display && display !== 'auto' && !fontDisplay) {
                fontDisplay = display;
              }

              if (family) {
                // Check if it's a variable font (has wght range)
                const isVariable = weight && weight.includes(' ');
                if (isVariable) {
                  sources.variableFonts.add(family);
                }

                // Only add if not already from a CDN
                const isFromCdn = sources.googleFonts.includes(family) ||
                                  sources.bunnyFonts.includes(family) ||
                                  sources.fontshare.includes(family);

                if (!isFromCdn && !fontFaceDeclarations.some(f => f.family === family)) {
                  // Determine format from src
                  let format = 'unknown';
                  if (src.includes('.woff2')) format = 'woff2';
                  else if (src.includes('.woff')) format = 'woff';
                  else if (src.includes('.ttf')) format = 'truetype';
                  else if (src.includes('.otf')) format = 'opentype';
                  else if (src.includes('.eot')) format = 'embedded-opentype';

                  fontFaceDeclarations.push({
                    family,
                    format,
                    display: display || 'auto',
                    isVariable: isVariable || false,
                  });
                }
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheets
        }
      }
    } catch (e) {
      // Ignore errors
    }

    // Add self-hosted fonts to sources
    fontFaceDeclarations.forEach(ff => {
      if (!sources.selfHosted.some(f => f.name === ff.family)) {
        sources.selfHosted.push({
          name: ff.family,
          format: ff.format,
          fontDisplay: ff.display,
          isVariable: ff.isVariable,
        });
      }
    });

    sources.fontDisplay = fontDisplay;

    // 8. Detect system font stacks
    const systemFontPatterns = [
      { pattern: /-apple-system|BlinkMacSystemFont/, name: 'System UI (Apple)' },
      { pattern: /system-ui/, name: 'System UI' },
      { pattern: /Segoe UI/, name: 'Segoe UI (Windows)' },
      { pattern: /SF Pro|SF Mono/, name: 'San Francisco (Apple)' },
      { pattern: /ui-sans-serif|ui-serif|ui-monospace/, name: 'Tailwind System Stack' },
    ];

    // Check body and html font-family for system fonts
    const rootFonts = getComputedStyle(document.body).fontFamily + ' ' +
                      getComputedStyle(document.documentElement).fontFamily;

    systemFontPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(rootFonts) && !sources.systemFonts.includes(name)) {
        sources.systemFonts.push(name);
      }
    });

    // ——— Sample elements ———
    const els = document.querySelectorAll(`
      h1,h2,h3,h4,h5,h6,p,span,a,button,[role="button"],.btn,.button,
      .hero,[class*="title"],[class*="heading"],[class*="text"],nav a
    `);

    els.forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return;

      const size = parseFloat(s.fontSize);
      const weight = parseInt(s.fontWeight) || 400;
      const fontFamilies = s.fontFamily.split(",").map(f => f.replace(/['"]/g, "").trim());
      const family = fontFamilies[0];
      const fallbacks = fontFamilies.slice(1).filter(f => f && f !== 'sans-serif' && f !== 'serif' && f !== 'monospace');
      const letterSpacing = s.letterSpacing;
      const textTransform = s.textTransform;
      const lineHeight = s.lineHeight;

      // Check for fluid typography (clamp, vw, vh)
      const isFluid = s.fontSize.includes('clamp') || s.fontSize.includes('vw') || s.fontSize.includes('vh');

      // Check for OpenType features
      const fontFeatures = s.fontFeatureSettings !== 'normal' ? s.fontFeatureSettings : null;

      // Build context label
      let context = "heading-1";
      const className = typeof el.className === 'string' ? el.className : (el.className.baseVal || '');
      if (
        el.tagName === "BUTTON" ||
        el.getAttribute("role") === "button" ||
        className.includes("btn")
      ) {
        context = "button";
      } else if (el.tagName === "A" && el.href) {
        context = "link";
      } else if (size <= 14) {
        context = "caption";
      } else if (el.tagName.match(/^H[1-6]$/)) {
        context = "heading-1";
      }

      const key = `${family}|${size}|${weight}|${context}|${letterSpacing}|${textTransform}`;
      if (seen.has(key)) return;

      // Parse line-height to unitless if possible
      let lineHeightValue = null;
      if (lineHeight !== 'normal') {
        const lhNum = parseFloat(lineHeight);
        // If line-height is in px, convert to unitless ratio
        if (lineHeight.includes('px')) {
          lineHeightValue = (lhNum / size).toFixed(2);
        } else {
          // Already unitless or in other unit
          lineHeightValue = lhNum.toFixed(2);
        }
      }

      seen.set(key, {
        context,
        family,
        fallbacks: fallbacks.length > 0 ? fallbacks.join(', ') : null,
        size: `${size}px (${(size / 16).toFixed(2)}rem)`,
        weight: weight,
        lineHeight: lineHeightValue,
        spacing: letterSpacing !== "normal" ? letterSpacing : null,
        transform: textTransform !== "none" ? textTransform : null,
        isFluid: isFluid || undefined,
        fontFeatures: fontFeatures || undefined,
      });
    });

    // Sort exactly like your original output (largest → smallest)
    const result = Array.from(seen.values()).sort((a, b) => {
      const aSize = parseFloat(a.size);
      const bSize = parseFloat(b.size);
      return bSize - aSize;
    });

    return {
      styles: result,
      sources: {
        googleFonts: sources.googleFonts.length > 0 ? sources.googleFonts : undefined,
        adobeFonts: sources.adobeFonts || undefined,
        bunnyFonts: sources.bunnyFonts.length > 0 ? sources.bunnyFonts : undefined,
        fontshare: sources.fontshare.length > 0 ? sources.fontshare : undefined,
        selfHosted: sources.selfHosted.length > 0 ? sources.selfHosted : undefined,
        systemFonts: sources.systemFonts.length > 0 ? sources.systemFonts : undefined,
        fontscom: sources.fontscom || undefined,
        variableFonts: [...sources.variableFonts].length > 0 ? [...sources.variableFonts] : undefined,
        fontDisplay: sources.fontDisplay || undefined,
      },
    };
  });
}

/**
 * Extract spacing scale and detect grid system
 */
async function extractSpacing(page) {
  return await page.evaluate(() => {
    const spacings = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);
      ["marginTop", "marginBottom", "paddingTop", "paddingBottom"].forEach(
        (prop) => {
          const value = parseFloat(computed[prop]);
          if (value > 0) {
            spacings.set(value, (spacings.get(value) || 0) + 1);
          }
        }
      );
    });

    const values = Array.from(spacings.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by count first to get most common
      .slice(0, 20)
      .map(([px, count]) => ({
        px: px + "px",
        rem: (px / 16).toFixed(2) + "rem",
        count,
        numericValue: px,
      }))
      .sort((a, b) => a.numericValue - b.numericValue); // Then sort by numeric value

    // Detect grid system
    const is4px = values.some((v) => parseFloat(v.px) % 4 === 0);
    const is8px = values.some((v) => parseFloat(v.px) % 8 === 0);
    const scaleType = is8px ? "8px" : is4px ? "4px" : "custom";

    return { scaleType, commonValues: values };
  });
}

/**
 * Extract border radius patterns
 */
async function extractBorderRadius(page) {
  return await page.evaluate(() => {
    const radii = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const radius = getComputedStyle(el).borderRadius;
      if (radius && radius !== "0px") {
        if (!radii.has(radius)) {
          radii.set(radius, { count: 0, elements: new Set() });
        }
        const data = radii.get(radius);
        data.count++;

        // Capture element context
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || el.getAttribute('aria-label');
        const classes = Array.from(el.classList);

        let context = tag;
        if (role) context = role;
        else if (classes.some(c => c.includes('button') || c.includes('btn'))) context = 'button';
        else if (classes.some(c => c.includes('card'))) context = 'card';
        else if (classes.some(c => c.includes('input') || c.includes('field'))) context = 'input';
        else if (classes.some(c => c.includes('badge') || c.includes('tag') || c.includes('chip'))) context = 'badge';
        else if (classes.some(c => c.includes('modal') || c.includes('dialog'))) context = 'modal';
        else if (classes.some(c => c.includes('image') || c.includes('img') || c.includes('avatar'))) context = 'image';

        data.elements.add(context);
      }
    });

    const values = Array.from(radii.entries())
      .map(([value, data]) => ({
        value,
        count: data.count,
        elements: Array.from(data.elements).slice(0, 5), // Limit to 5 element types
        confidence: data.count > 10 ? "high" : data.count > 3 ? "medium" : "low",
        numericValue: parseFloat(value) || 0, // Extract numeric value for sorting
      }))
      .sort((a, b) => {
        // Sort by numeric value, with percentage last
        if (a.value.includes("%") && !b.value.includes("%")) return 1;
        if (!a.value.includes("%") && b.value.includes("%")) return -1;
        return a.numericValue - b.numericValue;
      });

    return { values };
  });
}

/**
 * Extract border patterns as complete combinations (width + style + color)
 */
async function extractBorders(page) {
  return await page.evaluate(() => {
    const combinations = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);

      const borderWidth = computed.borderWidth;
      const borderStyle = computed.borderStyle;
      const borderColor = computed.borderColor;

      // Only process visible borders
      if (
        borderWidth &&
        borderWidth !== "0px" &&
        borderStyle &&
        borderStyle !== "none" &&
        borderColor &&
        borderColor !== "rgba(0, 0, 0, 0)" &&
        borderColor !== "transparent"
      ) {
        // Normalize color to extract individual colors from multi-value strings
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
        const individualColors = borderColor.match(colorRegex) || [borderColor];

        // Use the first color or the most common one
        const normalizedColor = individualColors[0];

        if (normalizedColor &&
            normalizedColor !== "rgba(0, 0, 0, 0)" &&
            normalizedColor !== "rgba(0,0,0,0)" &&
            normalizedColor !== "transparent") {

          const key = `${borderWidth}|${borderStyle}|${normalizedColor}`;

          if (!combinations.has(key)) {
            combinations.set(key, {
              width: borderWidth,
              style: borderStyle,
              color: normalizedColor,
              count: 0,
              elements: new Set()
            });
          }

          const combo = combinations.get(key);
          combo.count++;

          // Capture element context
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const classes = Array.from(el.classList);

          let context = tag;
          if (role) context = role;
          else if (classes.some(c => c.includes('button') || c.includes('btn'))) context = 'button';
          else if (classes.some(c => c.includes('card'))) context = 'card';
          else if (classes.some(c => c.includes('input') || c.includes('field'))) context = 'input';
          else if (classes.some(c => c.includes('modal') || c.includes('dialog'))) context = 'modal';

          combo.elements.add(context);
        }
      }
    });

    const processed = Array.from(combinations.values())
      .map(combo => ({
        width: combo.width,
        style: combo.style,
        color: combo.color,
        count: combo.count,
        elements: Array.from(combo.elements).slice(0, 5),
        confidence: combo.count > 10 ? "high" : combo.count > 3 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);

    return { combinations: processed };
  });
}

/**
 * Extract box shadow patterns for elevation systems
 */
async function extractShadows(page) {
  return await page.evaluate(() => {
    const shadows = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const shadow = getComputedStyle(el).boxShadow;
      if (shadow && shadow !== "none") {
        shadows.set(shadow, (shadows.get(shadow) || 0) + 1);
      }
    });

    return Array.from(shadows.entries())
      .map(([shadow, count]) => ({
        shadow,
        count,
        confidence: count > 5 ? "high" : count > 2 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);
  });
}

/**
 * Extract button component styles and variants - comprehensive
 */
async function extractButtonStyles(page) {
  return await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll(`
        button,
        input[type="button"],
        input[type="submit"],
        input[type="reset"],
        a[type="button"],
        a[href][class*="btn"],
        a[href][class*="button"],
        [role="button"],
        [role="tab"],
        [role="menuitem"],
        [role="switch"],
        [role="option"],
        [aria-pressed],
        [aria-expanded],
        [aria-haspopup],
        .btn,
        .button,
        [class*="btn-"],
        [class*="button-"],
        [class*="Button"],
        [class*="Btn"],
        [class*="cta"],
        [class*="CTA"],
        [class*="action"],
        [class*="submit"],
        [data-cta],
        [data-action],
        [data-button],
        [data-testid*="button"],
        [data-cy*="button"]
      `)
    );

    const extractState = (btn, stateName = 'default') => {
      const computed = getComputedStyle(btn);
      return {
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage !== 'none' ? computed.backgroundImage : null,
        color: computed.color,
        padding: computed.padding,
        paddingTop: computed.paddingTop,
        paddingRight: computed.paddingRight,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
        borderRadius: computed.borderRadius,
        border: computed.border,
        borderWidth: computed.borderWidth,
        borderStyle: computed.borderStyle,
        borderColor: computed.borderColor,
        boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : null,
        outline: computed.outline,
        outlineOffset: computed.outlineOffset,
        transform: computed.transform !== 'none' ? computed.transform : null,
        opacity: computed.opacity,
        transition: computed.transition !== 'all 0s ease 0s' ? computed.transition : null,
        cursor: computed.cursor,
        textTransform: computed.textTransform !== 'none' ? computed.textTransform : null,
        letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : null,
        lineHeight: computed.lineHeight,
        textDecoration: computed.textDecoration,
        fontFamily: computed.fontFamily,
      };
    };

    const buttonStyles = [];

    buttons.forEach((btn) => {
      const computed = getComputedStyle(btn);

      // Skip if not visible
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      // Button-stealer filtering: skip invisible elements
      if (computed.opacity === '0') return;
      if (computed.transform === 'matrix(0, 0, 0, 0, 0, 0)') return;

      // Button-stealer filtering: dimension constraints
      const width = rect.width;
      const height = rect.height;
      if (width < 10 || width > 600) return;  // Width between 10-600px
      if (height < 25 || height > 200) return;  // Height between 25-200px
      if (height / width > 1.2) return;  // Not too tall/narrow
      if (width / height > 8) return;  // Not too wide/short

      // Button-stealer filtering: text content validation
      const buttonText = btn.innerText?.trim() || '';
      const textNoSpaces = buttonText.split(' ').join('');
      if (textNoSpaces.length > 0 && textNoSpaces.length < 2) return;  // Text too short (but allow icon buttons)
      if (textNoSpaces.length > 32) return;  // Text too long
      if (buttonText.includes('\n') || buttonText.includes('\t')) return;  // Multi-line text
      if (buttonText.toLowerCase() === 'ad') return;  // Skip ad buttons
      if (buttonText.toLowerCase().split(' ').includes('skip')) return;  // Skip "skip" buttons
      if (buttonText.toLowerCase().split(' ').includes('jump')) return;  // Skip "jump" buttons

      // Skip material icons (button-stealer check)
      if (btn.querySelectorAll('[class*="material-icons"]').length > 0) return;
      if (btn.querySelectorAll('[class*="material-symbols"]').length > 0) return;

      // Check if button has any styling (background OR border)
      const bg = computed.backgroundColor;
      const border = computed.border;
      const borderWidth = computed.borderWidth;
      const hasBorder = borderWidth && parseFloat(borderWidth) > 0 && border !== 'none';
      const hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';

      // Button-stealer filtering: check child for background if parent is transparent
      let childHasBackground = false;
      if (!hasBackground && btn.children.length > 0) {
        const childComputed = getComputedStyle(btn.children[0]);
        const childBg = childComputed.backgroundColor;
        childHasBackground = childBg && childBg !== 'rgba(0, 0, 0, 0)' && childBg !== 'transparent';
      }

      // Skip only if BOTH background and border are missing/transparent (and no child background)
      if (!hasBackground && !hasBorder && !childHasBackground) {
        return;
      }

      // Determine confidence based on semantic HTML and ARIA
      const role = btn.getAttribute('role');
      const isNativeButton = btn.tagName === "BUTTON";
      const isButtonRole = ['button', 'tab', 'menuitem', 'switch'].includes(role);
      const hasAriaPressed = btn.hasAttribute('aria-pressed');
      const hasAriaExpanded = btn.hasAttribute('aria-expanded');
      const isHighConfidence = isNativeButton || isButtonRole || hasAriaPressed || hasAriaExpanded;

      // Handle className for both HTML and SVG elements
      const className = typeof btn.className === 'string'
        ? btn.className
        : btn.className.baseVal || '';

      // Extract default state
      const defaultState = extractState(btn, 'default');

      // Try to extract pseudo-class states from stylesheets
      const states = {
        default: defaultState,
        hover: null,
        active: null,
        focus: null,
      };

      // Attempt to read CSS rules for hover, active, focus states
      try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText) {
                // Check if this rule could apply to our button
                const btnClasses = className.split(' ').filter(c => c);
                const matchesButton = btnClasses.some(cls =>
                  rule.selectorText.includes(`.${cls}`)
                );

                if (matchesButton || rule.selectorText.includes(btn.tagName.toLowerCase())) {
                  if (rule.selectorText.includes(':hover')) {
                    if (!states.hover) states.hover = {};
                    if (rule.style.backgroundColor) states.hover.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.hover.color = rule.style.color;
                    if (rule.style.boxShadow) states.hover.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.hover.outline = rule.style.outline;
                    if (rule.style.border) states.hover.border = rule.style.border;
                    if (rule.style.transform) states.hover.transform = rule.style.transform;
                    if (rule.style.opacity) states.hover.opacity = rule.style.opacity;
                  }
                  if (rule.selectorText.includes(':active')) {
                    if (!states.active) states.active = {};
                    if (rule.style.backgroundColor) states.active.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.active.color = rule.style.color;
                    if (rule.style.boxShadow) states.active.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.active.outline = rule.style.outline;
                    if (rule.style.border) states.active.border = rule.style.border;
                    if (rule.style.transform) states.active.transform = rule.style.transform;
                    if (rule.style.opacity) states.active.opacity = rule.style.opacity;
                  }
                  if (rule.selectorText.includes(':focus')) {
                    if (!states.focus) states.focus = {};
                    if (rule.style.backgroundColor) states.focus.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.focus.color = rule.style.color;
                    if (rule.style.boxShadow) states.focus.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.focus.outline = rule.style.outline;
                    if (rule.style.border) states.focus.border = rule.style.border;
                    if (rule.style.transform) states.focus.transform = rule.style.transform;
                    if (rule.style.opacity) states.focus.opacity = rule.style.opacity;
                  }
                }
              }
            }
          } catch (e) {
            // CORS or other stylesheet access error, skip
          }
        }
      } catch (e) {
        // Stylesheet parsing failed
      }

      buttonStyles.push({
        states,
        fontWeight: computed.fontWeight,
        fontSize: computed.fontSize,
        classes: className.substring(0, 50),
        confidence: isHighConfidence ? "high" : "medium",
      });
    });

    // Deduplicate by default state background color
    const uniqueButtons = [];
    const seen = new Set();

    for (const btn of buttonStyles) {
      const key = btn.states.default.backgroundColor;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueButtons.push(btn);
      }
    }

    return uniqueButtons.slice(0, 15);
  });
}

/**
 * Extract input field styles with states - comprehensive
 */
async function extractInputStyles(page) {
  return await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll(`
        input[type="text"],
        input[type="email"],
        input[type="password"],
        input[type="search"],
        input[type="tel"],
        input[type="url"],
        input[type="number"],
        input[type="date"],
        input[type="datetime-local"],
        input[type="time"],
        input[type="week"],
        input[type="month"],
        input[type="color"],
        input[type="file"],
        input[type="range"],
        input[type="checkbox"],
        input[type="radio"],
        input:not([type]),
        textarea,
        select,
        [role="textbox"],
        [role="searchbox"],
        [role="combobox"],
        [role="spinbutton"],
        [role="slider"],
        [contenteditable="true"],
        [class*="input"],
        [class*="Input"],
        [class*="field"],
        [class*="Field"],
        [class*="form-control"],
        [class*="text-field"],
        [data-testid*="input"],
        [data-cy*="input"]
      `)
    );

    const inputGroups = {
      text: [],
      checkbox: [],
      radio: [],
      select: [],
      date: [],
      file: [],
      range: [],
    };

    inputs.forEach((input) => {
      const computed = getComputedStyle(input);

      // Skip if not visible
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      let inputType = 'text';
      if (input.tagName === 'TEXTAREA') {
        inputType = 'text';
      } else if (input.tagName === 'SELECT') {
        inputType = 'select';
      } else if (input.type === 'checkbox') {
        inputType = 'checkbox';
      } else if (input.type === 'radio') {
        inputType = 'radio';
      } else if (['date', 'datetime-local', 'time', 'week', 'month'].includes(input.type)) {
        inputType = 'date';
      } else if (input.type === 'file') {
        inputType = 'file';
      } else if (input.type === 'range') {
        inputType = 'range';
      } else if (['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'color'].includes(input.type) || !input.type) {
        inputType = 'text';
      }

      const specificType = input.type || input.tagName.toLowerCase();

      // Get placeholder styles if available
      let placeholderColor = null;
      try {
        // Try to get placeholder color from stylesheet rules
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              if (rule.selectorText && rule.selectorText.includes('::placeholder')) {
                placeholderColor = rule.style.color || null;
                break;
              }
            }
          } catch (e) {}
        }
      } catch (e) {}

      const defaultState = {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        border: computed.border,
        borderWidth: computed.borderWidth,
        borderStyle: computed.borderStyle,
        borderColor: computed.borderColor,
        borderRadius: computed.borderRadius,
        padding: computed.padding,
        paddingTop: computed.paddingTop,
        paddingRight: computed.paddingRight,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
        boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : null,
        outline: computed.outline,
        caretColor: computed.caretColor,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : null,
        transition: computed.transition !== 'all 0s ease 0s' ? computed.transition : null,
        placeholderColor,
        width: rect.width > 0 ? `${Math.round(rect.width)}px` : null,
        height: rect.height > 0 ? `${Math.round(rect.height)}px` : null,
      };

      // Try to extract focus state from CSS rules
      let focusState = null;
      try {
        const sheets = Array.from(document.styleSheets);
        const className = typeof input.className === 'string' ? input.className : input.className.baseVal || '';
        const classes = className.split(' ').filter(c => c);

        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText) {
                const matchesInput = classes.some(cls => rule.selectorText.includes(`.${cls}`)) ||
                                    rule.selectorText.includes(input.tagName.toLowerCase()) ||
                                    (input.type && rule.selectorText.includes(`[type="${input.type}"]`));

                if (matchesInput && rule.selectorText.includes(':focus')) {
                  if (!focusState) focusState = {};
                  if (rule.style.backgroundColor) focusState.backgroundColor = rule.style.backgroundColor;
                  if (rule.style.color) focusState.color = rule.style.color;
                  if (rule.style.border) focusState.border = rule.style.border;
                  if (rule.style.borderColor) focusState.borderColor = rule.style.borderColor;
                  if (rule.style.boxShadow) focusState.boxShadow = rule.style.boxShadow;
                  if (rule.style.outline) focusState.outline = rule.style.outline;
                }
              }
            }
          } catch (e) {
            // CORS error
          }
        }
      } catch (e) {
        // Stylesheet parsing failed
      }

      inputGroups[inputType].push({
        specificType,
        states: {
          default: defaultState,
          focus: focusState,
        },
      });
    });

    // Deduplicate each group by key properties
    const deduplicateGroup = (group) => {
      const seen = new Map();
      for (const item of group) {
        const key = `${item.states.default.border}|${item.states.default.borderRadius}|${item.states.default.backgroundColor}`;
        if (!seen.has(key)) {
          seen.set(key, item);
        }
      }
      return Array.from(seen.values());
    };

    return {
      text: deduplicateGroup(inputGroups.text).slice(0, 8),
      checkbox: deduplicateGroup(inputGroups.checkbox).slice(0, 5),
      radio: deduplicateGroup(inputGroups.radio).slice(0, 5),
      select: deduplicateGroup(inputGroups.select).slice(0, 5),
      date: deduplicateGroup(inputGroups.date).slice(0, 3),
      file: deduplicateGroup(inputGroups.file).slice(0, 3),
      range: deduplicateGroup(inputGroups.range).slice(0, 3),
    };
  });
}

/**
 * Extract link styles including hover, visited, active states - comprehensive
 */
async function extractLinkStyles(page) {
  return await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll(`
        a[href],
        a:not([href]),
        [role="link"],
        [aria-current],
        [class*="link"],
        [class*="Link"],
        [data-link],
        nav a,
        footer a,
        .nav-link,
        .menu-item a,
        .breadcrumb a
      `)
    );

    const uniqueStyles = new Map();

    // Normalize color to hex for deduplication
    const normalizeColor = (color) => {
      try {
        const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1]);
          const g = parseInt(rgbaMatch[2]);
          const b = parseInt(rgbaMatch[3]);
          return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        return color.toLowerCase();
      } catch {
        return color;
      }
    };

    links.forEach((link) => {
      const computed = getComputedStyle(link);

      // Skip if not visible
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      const key = normalizeColor(computed.color);

      if (!uniqueStyles.has(key)) {
        // Try to extract hover, visited, active states from CSS rules
        let hoverState = null;
        let visitedState = null;
        let activeState = null;
        let focusState = null;

        try {
          const sheets = Array.from(document.styleSheets);
          const className = typeof link.className === 'string' ? link.className : link.className.baseVal || '';
          const classes = className.split(' ').filter(c => c);

          for (const sheet of sheets) {
            try {
              const rules = Array.from(sheet.cssRules || []);
              for (const rule of rules) {
                if (rule.selectorText) {
                  const matchesLink = classes.some(cls => rule.selectorText.includes(`.${cls}`)) ||
                                     rule.selectorText.includes('a:');

                  if (matchesLink) {
                    if (rule.selectorText.includes(':hover')) {
                      if (!hoverState) hoverState = {};
                      if (rule.style.color) hoverState.color = rule.style.color;
                      if (rule.style.textDecoration) hoverState.textDecoration = rule.style.textDecoration;
                      if (rule.style.backgroundColor) hoverState.backgroundColor = rule.style.backgroundColor;
                      if (rule.style.borderBottom) hoverState.borderBottom = rule.style.borderBottom;
                      if (rule.style.opacity) hoverState.opacity = rule.style.opacity;
                    }
                    if (rule.selectorText.includes(':visited')) {
                      if (!visitedState) visitedState = {};
                      if (rule.style.color) visitedState.color = rule.style.color;
                    }
                    if (rule.selectorText.includes(':active')) {
                      if (!activeState) activeState = {};
                      if (rule.style.color) activeState.color = rule.style.color;
                      if (rule.style.backgroundColor) activeState.backgroundColor = rule.style.backgroundColor;
                    }
                    if (rule.selectorText.includes(':focus')) {
                      if (!focusState) focusState = {};
                      if (rule.style.color) focusState.color = rule.style.color;
                      if (rule.style.outline) focusState.outline = rule.style.outline;
                      if (rule.style.boxShadow) focusState.boxShadow = rule.style.boxShadow;
                    }
                  }
                }
              }
            } catch (e) {
              // CORS error
            }
          }
        } catch (e) {
          // Stylesheet parsing failed
        }

        // Determine link type/context
        let context = 'inline';
        const className = typeof link.className === 'string' ? link.className : '';
        if (link.closest('nav') || className.includes('nav')) context = 'navigation';
        else if (link.closest('footer')) context = 'footer';
        else if (link.closest('.breadcrumb') || className.includes('breadcrumb')) context = 'breadcrumb';
        else if (link.closest('button') || className.includes('btn') || className.includes('button')) context = 'button';

        uniqueStyles.set(key, {
          color: computed.color,
          textDecoration: computed.textDecoration,
          textDecorationColor: computed.textDecorationColor,
          textDecorationStyle: computed.textDecorationStyle,
          textDecorationThickness: computed.textDecorationThickness,
          textUnderlineOffset: computed.textUnderlineOffset,
          fontWeight: computed.fontWeight,
          fontSize: computed.fontSize,
          letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : null,
          transition: computed.transition !== 'all 0s ease 0s' ? computed.transition : null,
          cursor: computed.cursor,
          context,
          states: {
            default: {
              color: computed.color,
              textDecoration: computed.textDecoration,
            },
            hover: hoverState,
            visited: visitedState,
            active: activeState,
            focus: focusState,
          },
        });
      }
    });

    return Array.from(uniqueStyles.values()).slice(0, 12);
  });
}

/**
 * Detect responsive breakpoints from CSS
 */
async function extractBreakpoints(page) {
  return await page.evaluate(() => {
    const breakpoints = new Set();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.media) {
            const match = rule.media.mediaText.match(/(\d+)px/g);
            if (match) match.forEach((m) => breakpoints.add(parseInt(m)));
          }
        }
      } catch (e) {
        // Cross-origin stylesheets may throw errors
      }
    }

    return Array.from(breakpoints)
      .sort((a, b) => a - b)
      .map((px) => ({ px: px + "px" }));
  });
}

/**
 * Detect icon systems in use - comprehensive detection
 */
async function detectIconSystem(page) {
  return await page.evaluate(() => {
    const systems = [];
    const html = document.documentElement.outerHTML;

    // Helper to count elements matching selector
    function countMatches(selector) {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    }

    // Helper to check if resource exists
    function hasResource(pattern) {
      const links = Array.from(document.querySelectorAll('link[href], script[src]'));
      return links.some(el => pattern.test(el.href || el.src || ''));
    }

    // 1. Font Awesome - Multiple variants
    const faCount = countMatches('[class*="fa-"]:not([class*="face"])');
    const fabCount = countMatches('[class*="fab "], [class*=" fab"]');
    const fasCount = countMatches('[class*="fas "], [class*=" fas"]');
    const farCount = countMatches('[class*="far "], [class*=" far"]');
    const falCount = countMatches('[class*="fal "], [class*=" fal"]');
    const fadCount = countMatches('[class*="fad "], [class*=" fad"]');
    const faTotal = faCount + fabCount + fasCount + farCount + falCount + fadCount;
    const hasFaCdn = hasResource(/fontawesome|fa-.*\.js|kit\.fontawesome/);

    if (faTotal > 2 || hasFaCdn) {
      let version = 'Unknown';
      if (fabCount > 0 || fasCount > 0) version = '5+';
      if (fadCount > 0) version = '6 Pro';
      systems.push({
        name: "Font Awesome",
        type: "icon-font",
        count: faTotal,
        version,
        confidence: faTotal > 5 ? 'high' : 'medium'
      });
    }

    // 2. Material Icons / Material Symbols
    const materialIconsCount = countMatches('.material-icons, .material-icons-outlined, .material-icons-round, .material-icons-sharp, .material-icons-two-tone');
    const materialSymbolsCount = countMatches('[class*="material-symbols"]');
    const hasMaterialCdn = hasResource(/fonts\.googleapis\.com.*Material\+Icons|fonts\.googleapis\.com.*Material\+Symbols/);

    if (materialIconsCount > 0 || hasMaterialCdn) {
      systems.push({
        name: "Material Icons",
        type: "icon-font",
        count: materialIconsCount,
        confidence: 'high'
      });
    }

    if (materialSymbolsCount > 0) {
      systems.push({
        name: "Material Symbols",
        type: "icon-font",
        count: materialSymbolsCount,
        confidence: 'high'
      });
    }

    // 3. Bootstrap Icons
    const biCount = countMatches('[class^="bi-"], [class*=" bi-"]');
    const hasBiCdn = hasResource(/bootstrap-icons/);

    if (biCount > 2 || hasBiCdn) {
      systems.push({
        name: "Bootstrap Icons",
        type: "icon-font",
        count: biCount,
        confidence: biCount > 5 ? 'high' : 'medium'
      });
    }

    // 4. Heroicons - Usually inline SVG with specific paths
    const heroiconSvgs = document.querySelectorAll('svg[class*="h-"][class*="w-"]');
    let heroiconCount = 0;
    heroiconSvgs.forEach(svg => {
      // Heroicons have very specific viewBox and path patterns
      if (svg.getAttribute('viewBox') === '0 0 24 24' || svg.getAttribute('viewBox') === '0 0 20 20') {
        const paths = svg.querySelectorAll('path');
        if (paths.length >= 1 && paths.length <= 3) {
          heroiconCount++;
        }
      }
    });
    const hasHeroiconImport = /heroicons|@heroicons/i.test(html);

    if (heroiconCount > 3 || hasHeroiconImport) {
      systems.push({
        name: "Heroicons",
        type: "svg",
        count: heroiconCount,
        confidence: heroiconCount > 5 ? 'high' : 'medium'
      });
    }

    // 5. Lucide Icons
    const lucideCount = countMatches('[class*="lucide"], svg[data-lucide]');
    const hasLucide = hasResource(/lucide/) || /lucide-react|lucide-vue|lucide-svelte/i.test(html);

    if (lucideCount > 0 || hasLucide) {
      systems.push({
        name: "Lucide Icons",
        type: "svg",
        count: lucideCount,
        confidence: 'high'
      });
    }

    // 6. Feather Icons
    const featherCount = countMatches('[class*="feather"], svg[data-feather]');
    const hasFeather = hasResource(/feather-icons|feathericons/);

    if (featherCount > 0 || hasFeather) {
      systems.push({
        name: "Feather Icons",
        type: "svg",
        count: featherCount,
        confidence: 'high'
      });
    }

    // 7. Ionicons
    const ionCount = countMatches('ion-icon, [class^="ion-"], [class*=" ion-"]');
    const hasIonicons = hasResource(/ionicons/);

    if (ionCount > 0 || hasIonicons) {
      systems.push({
        name: "Ionicons",
        type: "web-component",
        count: ionCount,
        confidence: 'high'
      });
    }

    // 8. Phosphor Icons
    const phCount = countMatches('[class^="ph-"], [class*=" ph-"], [class*="ph "]');
    const hasPhosphor = hasResource(/phosphor-icons/);

    if (phCount > 2 || hasPhosphor) {
      systems.push({
        name: "Phosphor Icons",
        type: "icon-font",
        count: phCount,
        confidence: phCount > 5 ? 'high' : 'medium'
      });
    }

    // 9. Tabler Icons
    const tablerCount = countMatches('[class^="ti-"], [class*=" ti-"], [class*="tabler-icon"]');
    const hasTabler = hasResource(/tabler-icons|tabler\.io/);

    if (tablerCount > 2 || hasTabler) {
      systems.push({
        name: "Tabler Icons",
        type: "icon-font",
        count: tablerCount,
        confidence: tablerCount > 5 ? 'high' : 'medium'
      });
    }

    // 10. Remix Icons
    const riCount = countMatches('[class^="ri-"], [class*=" ri-"]');
    const hasRemix = hasResource(/remixicon/);

    if (riCount > 2 || hasRemix) {
      systems.push({
        name: "Remix Icons",
        type: "icon-font",
        count: riCount,
        confidence: riCount > 5 ? 'high' : 'medium'
      });
    }

    // 11. Simple Icons (brand icons)
    const siCount = countMatches('[class^="si-"], [class*=" si-"]');
    const hasSimpleIcons = hasResource(/simple-icons/);

    if (siCount > 0 || hasSimpleIcons) {
      systems.push({
        name: "Simple Icons",
        type: "svg",
        count: siCount,
        confidence: 'high'
      });
    }

    // 12. Boxicons
    const bxCount = countMatches('[class^="bx-"], [class*=" bx-"], [class^="bx "], [class*=" bx "]');
    const hasBoxicons = hasResource(/boxicons/);

    if (bxCount > 2 || hasBoxicons) {
      systems.push({
        name: "Boxicons",
        type: "icon-font",
        count: bxCount,
        confidence: bxCount > 5 ? 'high' : 'medium'
      });
    }

    // 13. Iconify (universal icon framework)
    const iconifyCount = countMatches('[class*="iconify"], iconify-icon, span[data-icon]');
    const hasIconify = hasResource(/iconify/) || window.Iconify !== undefined;

    if (iconifyCount > 0 || hasIconify) {
      systems.push({
        name: "Iconify",
        type: "universal",
        count: iconifyCount,
        confidence: 'high'
      });
    }

    // 14. SVG Sprite Detection
    const svgSprites = document.querySelectorAll('svg symbol[id], svg > defs > symbol');
    const useElements = document.querySelectorAll('svg use[href], svg use[xlink\\:href]');

    if (svgSprites.length > 0 || useElements.length > 3) {
      systems.push({
        name: "SVG Sprite",
        type: "svg-sprite",
        count: Math.max(svgSprites.length, useElements.length),
        confidence: 'high'
      });
    }

    // 15. Generic inline SVG icons (if no other system detected)
    if (systems.length === 0) {
      const inlineSvgs = document.querySelectorAll('svg');
      let iconSvgCount = 0;

      inlineSvgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        // Icons are typically small and square-ish
        if (rect.width > 10 && rect.width < 100 && rect.height > 10 && rect.height < 100) {
          const aspectRatio = rect.width / rect.height;
          if (aspectRatio > 0.5 && aspectRatio < 2) {
            iconSvgCount++;
          }
        }
      });

      if (iconSvgCount > 5) {
        systems.push({
          name: "Custom SVG Icons",
          type: "svg",
          count: iconSvgCount,
          confidence: 'medium'
        });
      }
    }

    // 16. Check for icon fonts via CSS (fallback detection)
    if (systems.length === 0) {
      try {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              if (rule instanceof CSSFontFaceRule) {
                const fontFamily = rule.style.fontFamily?.toLowerCase() || '';
                if (fontFamily.includes('icon') || fontFamily.includes('glyph')) {
                  systems.push({
                    name: `Custom Icon Font (${rule.style.fontFamily})`,
                    type: 'icon-font',
                    confidence: 'medium'
                  });
                  break;
                }
              }
            }
          } catch (e) {
            // Cross-origin
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    return systems;
  });
}

/**
 * Detect CSS frameworks and libraries
 */
async function detectFrameworks(page) {
  return await page.evaluate(() => {
    const frameworks = [];
    const html = document.documentElement.outerHTML;
    const body = document.body;

    // Helper: Count elements with pattern
    function countMatches(selector) {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    }

    // Helper: Check if stylesheet/script exists
    function hasResource(pattern) {
      const links = Array.from(document.querySelectorAll('link[href], script[src]'));
      return links.some(el => pattern.test(el.href || el.src));
    }

    // 1. Tailwind CSS - Very specific detection
    const tailwindEvidence = [];

    // Arbitrary values are almost 100% unique to Tailwind
    if (/\b\w+-\[[^\]]+\]/.test(html)) {
      tailwindEvidence.push('arbitrary values (e.g., top-[117px])');
    }

    // Stacked modifiers (md:hover:, dark:, etc.)
    if (/(sm|md|lg|xl|2xl|dark|hover|focus|group-hover|peer-):[a-z]/.test(html)) {
      tailwindEvidence.push('responsive/state modifiers');
    }

    // CDN or build file
    if (hasResource(/tailwindcss|tailwind\.css|cdn\.tailwindcss/)) {
      tailwindEvidence.push('stylesheet');
    }

    if (tailwindEvidence.length >= 2) {
      frameworks.push({
        name: 'Tailwind CSS',
        confidence: 'high',
        evidence: tailwindEvidence.join(', ')
      });
    }

    // 2. Bootstrap - Check for specific patterns + CDN
    const bootstrapEvidence = [];

    // Bootstrap has very specific class combinations
    const hasContainer = countMatches('.container, .container-fluid') > 0;
    const hasRow = countMatches('.row') > 0;
    const hasCol = countMatches('[class*="col-"]') > 0;

    if (hasContainer && hasRow && hasCol) {
      bootstrapEvidence.push('grid system (container + row + col)');
    }

    // Bootstrap buttons are very predictable
    if (/\bbtn-primary\b|\bbtn-secondary\b|\bbtn-success\b/.test(html)) {
      bootstrapEvidence.push('button variants');
    }

    // CDN or build file
    if (hasResource(/bootstrap\.min\.css|bootstrap\.css|getbootstrap\.com/)) {
      bootstrapEvidence.push('stylesheet');
    }

    if (bootstrapEvidence.length >= 2) {
      frameworks.push({
        name: 'Bootstrap',
        confidence: 'high',
        evidence: bootstrapEvidence.join(', ')
      });
    }

    // 3. Material UI (MUI) - Very distinctive
    const muiCount = countMatches('[class*="MuiBox-"], [class*="MuiButton-"], [class*="Mui"]');
    if (muiCount > 3) {
      frameworks.push({
        name: 'Material UI (MUI)',
        confidence: 'high',
        evidence: `${muiCount} MUI components`
      });
    }

    // 4. Chakra UI - Check for chakra- prefix
    const chakraCount = countMatches('[class*="chakra-"]');
    if (chakraCount > 3) {
      frameworks.push({
        name: 'Chakra UI',
        confidence: 'high',
        evidence: `${chakraCount} Chakra components`
      });
    }

    // 5. Ant Design - ant- prefix at word boundary (not "merchant", "assistant")
    const antCount = countMatches('[class^="ant-"], [class*=" ant-"]');
    if (antCount > 3) {
      frameworks.push({
        name: 'Ant Design',
        confidence: 'high',
        evidence: `${antCount} Ant components`
      });
    }

    // 6. Vuetify - v- prefix + theme attributes
    const vuetifyCount = countMatches('[class*="v-btn"], [class*="v-card"], [class*="v-"]');
    const hasVuetifyTheme = body.classList.contains('theme--light') || body.classList.contains('theme--dark');
    if (vuetifyCount > 5 || hasVuetifyTheme) {
      frameworks.push({
        name: 'Vuetify',
        confidence: 'high',
        evidence: `${vuetifyCount} v- components`
      });
    }

    // 7. Shopify Polaris - Very long Polaris- prefixed classes
    const polarisCount = countMatches('[class*="Polaris-"]');
    if (polarisCount > 2) {
      frameworks.push({
        name: 'Shopify Polaris',
        confidence: 'high',
        evidence: `${polarisCount} Polaris components`
      });
    }

    // 8. Radix UI - data-radix- attributes (headless)
    const radixCount = document.querySelectorAll('[data-radix-], [data-state]').length;
    const hasRadix = radixCount > 5;
    if (hasRadix) {
      frameworks.push({
        name: 'Radix UI',
        confidence: 'high',
        evidence: `${radixCount} Radix primitives`
      });
    }

    // 9. shadcn/ui - Built on Radix + Tailwind with specific class patterns
    // shadcn/ui uses Radix primitives + specific Tailwind class combinations
    if (hasRadix && tailwindEvidence.length >= 1) {
      // shadcn specific patterns: uses CVA (class-variance-authority) style classes
      // Common shadcn component class patterns
      const shadcnIndicators = [];

      // Check for shadcn-specific component patterns (using Radix + specific Tailwind combinations)
      const hasScrollArea = countMatches('[data-radix-scroll-area-viewport]') > 0;
      const hasDialog = countMatches('[data-radix-dialog-overlay], [role="dialog"][data-state]') > 0;
      const hasDropdown = countMatches('[data-radix-dropdown-menu-content]') > 0;
      const hasAccordion = countMatches('[data-radix-accordion-root], [data-state][data-orientation]') > 0;
      const hasTooltip = countMatches('[data-radix-tooltip-content]') > 0;
      const hasPopover = countMatches('[data-radix-popover-content]') > 0;
      const hasSelect = countMatches('[data-radix-select-viewport], [data-radix-select-content]') > 0;
      const hasSheet = countMatches('[data-state][class*="fixed"][class*="inset"]') > 0;

      // shadcn uses specific CSS variable naming
      const hasShadcnVars = html.includes('--radius') || html.includes('--background') || html.includes('--foreground') || html.includes('--muted') || html.includes('--accent');

      // Check for common shadcn utility patterns
      const hasShadcnPatterns = /\btext-muted-foreground\b|\bbg-background\b|\bbg-card\b|\btext-card-foreground\b|\bborder-input\b|\bring-ring\b/.test(html);

      // shadcn Button variants
      const hasShadcnButtons = /\bvariant-(default|destructive|outline|secondary|ghost|link)\b/.test(html) ||
                              /\binline-flex\s+items-center\s+justify-center\s+.*rounded-md\s+.*font-medium\b/.test(html);

      // Count indicators
      if (hasScrollArea) shadcnIndicators.push('ScrollArea');
      if (hasDialog) shadcnIndicators.push('Dialog');
      if (hasDropdown) shadcnIndicators.push('DropdownMenu');
      if (hasAccordion) shadcnIndicators.push('Accordion');
      if (hasTooltip) shadcnIndicators.push('Tooltip');
      if (hasPopover) shadcnIndicators.push('Popover');
      if (hasSelect) shadcnIndicators.push('Select');
      if (hasSheet) shadcnIndicators.push('Sheet');
      if (hasShadcnVars) shadcnIndicators.push('CSS variables');
      if (hasShadcnPatterns) shadcnIndicators.push('semantic classes');
      if (hasShadcnButtons) shadcnIndicators.push('Button variants');

      if (shadcnIndicators.length >= 3) {
        frameworks.push({
          name: 'shadcn/ui',
          confidence: 'high',
          evidence: shadcnIndicators.join(', ')
        });
      } else if (shadcnIndicators.length >= 1) {
        frameworks.push({
          name: 'shadcn/ui',
          confidence: 'medium',
          evidence: shadcnIndicators.join(', ')
        });
      }
    }

    // 10. Headless UI (Tailwind Labs) - Similar to Radix but different data attributes
    const headlessUICount = document.querySelectorAll('[data-headlessui-state], [data-headlessui-focus-visible]').length;
    if (headlessUICount > 3) {
      frameworks.push({
        name: 'Headless UI',
        confidence: 'high',
        evidence: `${headlessUICount} Headless UI components`
      });
    }

    // 11. Mantine - @mantine classes and data attributes
    const mantineCount = countMatches('[class*="mantine-"], [data-mantine-]');
    if (mantineCount > 3) {
      frameworks.push({
        name: 'Mantine',
        confidence: 'high',
        evidence: `${mantineCount} Mantine components`
      });
    }

    // 12. NextUI - nextui- class prefix
    const nextUICount = countMatches('[class*="nextui-"], [data-nextui-]');
    if (nextUICount > 2) {
      frameworks.push({
        name: 'NextUI',
        confidence: 'high',
        evidence: `${nextUICount} NextUI components`
      });
    }

    // 13. PrimeReact/PrimeVue/PrimeNG - p- prefix classes
    const primeCount = countMatches('[class^="p-"], [class*=" p-component"], [class*="p-button"], [class*="p-inputtext"]');
    const hasPrimeTheme = countMatches('[class*="p-theme-"], .p-datatable, .p-dialog') > 0;
    if (primeCount > 5 || hasPrimeTheme) {
      frameworks.push({
        name: 'PrimeReact/PrimeVue',
        confidence: 'high',
        evidence: `${primeCount} Prime components`
      });
    }

    // 14. Flowbite - Built on Tailwind with specific patterns
    if (tailwindEvidence.length >= 1) {
      const hasFlowbite = hasResource(/flowbite/) ||
                         countMatches('[data-modal-toggle], [data-dropdown-toggle], [data-accordion]') > 2;
      if (hasFlowbite) {
        frameworks.push({
          name: 'Flowbite',
          confidence: 'high',
          evidence: 'Flowbite scripts/components detected'
        });
      }
    }

    // 15. Tremor - React charts + Tailwind
    const tremorCount = countMatches('[class*="tremor-"], .tremor-base');
    if (tremorCount > 2) {
      frameworks.push({
        name: 'Tremor',
        confidence: 'high',
        evidence: `${tremorCount} Tremor components`
      });
    }

    // 16. Ariakit/Reakit - aria-* based headless components
    const ariakitCount = document.querySelectorAll('[data-command], [data-disclosure], [data-dialog-state]').length;
    if (ariakitCount > 3) {
      frameworks.push({
        name: 'Ariakit',
        confidence: 'medium',
        evidence: `${ariakitCount} Ariakit patterns`
      });
    }

    // 17. Aceternity UI - Specific animation patterns with Tailwind
    const aceternityPatterns = countMatches('[class*="aceternity"], [class*="hover-effect"], .card-stack, .text-reveal');
    if (aceternityPatterns > 2 && tailwindEvidence.length >= 1) {
      frameworks.push({
        name: 'Aceternity UI',
        confidence: 'medium',
        evidence: `${aceternityPatterns} Aceternity patterns`
      });
    }

    // 18. Magic UI - Animation components
    const magicUIPatterns = countMatches('[class*="magic-"], .magic-card, .spotlight-card');
    if (magicUIPatterns > 1) {
      frameworks.push({
        name: 'Magic UI',
        confidence: 'medium',
        evidence: `${magicUIPatterns} Magic UI components`
      });
    }

    // 19. Park UI - Built on Ark UI primitives
    const parkUICount = countMatches('[data-scope][data-part], [class*="park-"]');
    if (parkUICount > 3) {
      frameworks.push({
        name: 'Park UI',
        confidence: 'medium',
        evidence: `${parkUICount} Park UI patterns`
      });
    }

    // 20. Catalyst (Tailwind) - Official Tailwind UI kit
    const catalystPatterns = /\bdata-\[slot=\w+\]/.test(html) && tailwindEvidence.length >= 1;
    if (catalystPatterns) {
      frameworks.push({
        name: 'Catalyst (Tailwind)',
        confidence: 'medium',
        evidence: 'Tailwind slot patterns detected'
      });
    }

    // 21. DaisyUI - Requires Tailwind + specific DaisyUI-only component classes
    if (tailwindEvidence.length >= 2) {
      // Check for DaisyUI-specific classes that aren't in standard Tailwind
      const daisySpecific = countMatches('.btn-primary.btn, .badge, .drawer, .swap, .mockup-code');
      const hasDaisyTheme = body.hasAttribute('data-theme');
      if (daisySpecific > 3 || hasDaisyTheme) {
        frameworks.push({
          name: 'DaisyUI',
          confidence: 'high',
          evidence: `Tailwind + ${daisySpecific} DaisyUI components`
        });
      }
    }

    return frameworks;
  });
}

/**
 * Extract badges, tags, pills, and chip components (#18)
 */
async function extractBadgesAndTags(page) {
  return await page.evaluate(() => {
    const badges = [];
    const seen = new Set();

    // Comprehensive selectors for badges, tags, pills, chips
    const elements = document.querySelectorAll(`
      .badge,
      .tag,
      .pill,
      .chip,
      .label:not(label),
      [class*="badge"],
      [class*="Badge"],
      [class*="tag-"],
      [class*="Tag"],
      [class*="pill"],
      [class*="Pill"],
      [class*="chip"],
      [class*="Chip"],
      [class*="label-"]:not(label),
      [class*="status"],
      [class*="Status"],
      [data-badge],
      [data-tag],
      [role="status"],
      span[class*="rounded-full"],
      span[class*="rounded-pill"],
      .MuiChip-root,
      .ant-tag,
      .chakra-badge,
      .Polaris-Tag,
      .Polaris-Badge
    `);

    elements.forEach(el => {
      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip hidden or very large elements (not badges)
      if (rect.width === 0 || rect.height === 0 ||
          rect.width > 300 || rect.height > 60 ||
          computed.display === 'none' ||
          computed.visibility === 'hidden') {
        return;
      }

      // Create a signature to avoid duplicates
      const signature = `${computed.backgroundColor}|${computed.color}|${computed.borderRadius}|${computed.padding}`;
      if (seen.has(signature)) return;
      seen.add(signature);

      // Determine badge type based on context
      let badgeType = 'default';
      const text = el.textContent?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';

      if (className.includes('success') || className.includes('positive') ||
          text.includes('active') || text.includes('success') || text.includes('completed')) {
        badgeType = 'success';
      } else if (className.includes('error') || className.includes('danger') || className.includes('negative') ||
                 text.includes('error') || text.includes('failed')) {
        badgeType = 'error';
      } else if (className.includes('warning') || className.includes('caution') ||
                 text.includes('pending') || text.includes('warning')) {
        badgeType = 'warning';
      } else if (className.includes('info') || className.includes('primary') ||
                 text.includes('new') || text.includes('beta')) {
        badgeType = 'info';
      } else if (className.includes('neutral') || className.includes('secondary') || className.includes('muted')) {
        badgeType = 'neutral';
      }

      badges.push({
        type: badgeType,
        text: el.textContent?.trim().substring(0, 50) || '',
        styles: {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          border: computed.border,
          borderRadius: computed.borderRadius,
          padding: computed.padding,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          textTransform: computed.textTransform !== 'none' ? computed.textTransform : null,
          letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : null,
          lineHeight: computed.lineHeight,
          boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : null,
        },
        dimensions: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      });
    });

    return badges.slice(0, 20);
  });
}

/**
 * Extract form components with fieldsets and validation patterns (#17 - Forms 2.0)
 */
async function extractForms(page) {
  return await page.evaluate(() => {
    const forms = [];

    // Get all forms
    const formElements = document.querySelectorAll('form, [role="form"]');

    formElements.forEach(form => {
      const formData = {
        id: form.id || null,
        action: form.action || null,
        method: form.method || 'get',
        fieldsets: [],
        fields: [],
        submitButton: null,
        validationPatterns: [],
        layout: null,
      };

      // Detect form layout
      const formComputed = getComputedStyle(form);
      if (formComputed.display === 'grid') {
        formData.layout = 'grid';
      } else if (formComputed.display === 'flex') {
        formData.layout = formComputed.flexDirection === 'column' ? 'flex-column' : 'flex-row';
      } else {
        formData.layout = 'block';
      }

      // Extract fieldsets
      form.querySelectorAll('fieldset').forEach(fieldset => {
        const legend = fieldset.querySelector('legend');
        const fsComputed = getComputedStyle(fieldset);

        formData.fieldsets.push({
          legend: legend?.textContent?.trim() || null,
          styles: {
            border: fsComputed.border,
            borderRadius: fsComputed.borderRadius,
            padding: fsComputed.padding,
            margin: fsComputed.margin,
            backgroundColor: fsComputed.backgroundColor,
          },
          fieldCount: fieldset.querySelectorAll('input, select, textarea').length,
        });
      });

      // Extract all form fields
      form.querySelectorAll('input, select, textarea').forEach(field => {
        const fieldComputed = getComputedStyle(field);
        const label = form.querySelector(`label[for="${field.id}"]`) ||
                      field.closest('label') ||
                      field.previousElementSibling?.tagName === 'LABEL' ? field.previousElementSibling : null;

        const fieldData = {
          type: field.type || field.tagName.toLowerCase(),
          name: field.name || null,
          id: field.id || null,
          placeholder: field.placeholder || null,
          required: field.required || field.hasAttribute('aria-required'),
          pattern: field.pattern || null,
          minLength: field.minLength > 0 ? field.minLength : null,
          maxLength: field.maxLength > 0 && field.maxLength < 524288 ? field.maxLength : null,
          min: field.min || null,
          max: field.max || null,
          hasLabel: !!label,
          labelText: label?.textContent?.trim() || null,
          hasErrorState: field.classList.contains('error') ||
                         field.classList.contains('invalid') ||
                         field.hasAttribute('aria-invalid'),
          styles: {
            width: fieldComputed.width,
            height: fieldComputed.height,
            padding: fieldComputed.padding,
            border: fieldComputed.border,
            borderRadius: fieldComputed.borderRadius,
            backgroundColor: fieldComputed.backgroundColor,
            fontSize: fieldComputed.fontSize,
          }
        };

        // Detect validation patterns
        if (field.pattern) {
          formData.validationPatterns.push({
            field: field.name || field.type,
            pattern: field.pattern,
            type: 'regex'
          });
        }

        if (field.type === 'email') {
          formData.validationPatterns.push({
            field: field.name || 'email',
            type: 'email'
          });
        }

        if (field.type === 'tel') {
          formData.validationPatterns.push({
            field: field.name || 'phone',
            type: 'phone'
          });
        }

        if (field.type === 'url') {
          formData.validationPatterns.push({
            field: field.name || 'url',
            type: 'url'
          });
        }

        formData.fields.push(fieldData);
      });

      // Find submit button
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (submitBtn) {
        const btnComputed = getComputedStyle(submitBtn);
        formData.submitButton = {
          text: submitBtn.textContent?.trim() || submitBtn.value || 'Submit',
          styles: {
            backgroundColor: btnComputed.backgroundColor,
            color: btnComputed.color,
            padding: btnComputed.padding,
            borderRadius: btnComputed.borderRadius,
            fontSize: btnComputed.fontSize,
            fontWeight: btnComputed.fontWeight,
          }
        };
      }

      // Look for error message patterns
      const errorMessages = form.querySelectorAll('.error, .error-message, [class*="error"], [role="alert"], .invalid-feedback, .form-error');
      formData.hasErrorMessages = errorMessages.length > 0;
      formData.errorMessageStyles = null;

      if (errorMessages.length > 0) {
        const errComputed = getComputedStyle(errorMessages[0]);
        formData.errorMessageStyles = {
          color: errComputed.color,
          fontSize: errComputed.fontSize,
          fontWeight: errComputed.fontWeight,
        };
      }

      forms.push(formData);
    });

    return forms.slice(0, 10);
  });
}

/**
 * Accessibility audit - color contrast and WCAG compliance (#19)
 */
async function extractAccessibilityAudit(page) {
  return await page.evaluate(() => {
    const audit = {
      colorContrast: [],
      missingAltText: 0,
      missingLabels: 0,
      missingHeadings: false,
      headingStructure: [],
      focusIndicators: [],
      ariaUsage: {
        landmarks: 0,
        labels: 0,
        describedBy: 0,
        live: 0,
      },
      issues: [],
    };

    // Helper: Calculate relative luminance
    function getLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    // Helper: Calculate contrast ratio
    function getContrastRatio(l1, l2) {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // Helper: Parse RGB from color string
    function parseRgb(color) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
      }
      // Handle hex
      const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
      if (hexMatch) {
        return {
          r: parseInt(hexMatch[1], 16),
          g: parseInt(hexMatch[2], 16),
          b: parseInt(hexMatch[3], 16)
        };
      }
      return null;
    }

    // Check color contrast for text elements
    const textElements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button');
    const contrastChecked = new Set();

    textElements.forEach(el => {
      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip hidden elements
      if (rect.width === 0 || rect.height === 0 ||
          computed.display === 'none' ||
          computed.visibility === 'hidden') {
        return;
      }

      const fgColor = computed.color;
      const bgColor = computed.backgroundColor;
      const fontSize = parseFloat(computed.fontSize);
      const fontWeight = parseInt(computed.fontWeight) || 400;

      // Skip if we've already checked this combination
      const key = `${fgColor}|${bgColor}`;
      if (contrastChecked.has(key)) return;
      contrastChecked.add(key);

      const fg = parseRgb(fgColor);
      const bg = parseRgb(bgColor);

      if (fg && bg && bgColor !== 'rgba(0, 0, 0, 0)') {
        const fgLum = getLuminance(fg.r, fg.g, fg.b);
        const bgLum = getLuminance(bg.r, bg.g, bg.b);
        const ratio = getContrastRatio(fgLum, bgLum);

        // WCAG requirements
        const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
        const aaRequired = isLargeText ? 3 : 4.5;
        const aaaRequired = isLargeText ? 4.5 : 7;

        const passesAA = ratio >= aaRequired;
        const passesAAA = ratio >= aaaRequired;

        audit.colorContrast.push({
          foreground: fgColor,
          background: bgColor,
          ratio: Math.round(ratio * 100) / 100,
          fontSize: `${fontSize}px`,
          isLargeText,
          passesAA,
          passesAAA,
          wcagLevel: passesAAA ? 'AAA' : passesAA ? 'AA' : 'Fail',
        });

        if (!passesAA) {
          audit.issues.push({
            type: 'contrast',
            severity: 'error',
            message: `Insufficient contrast ratio (${Math.round(ratio * 100) / 100}:1) for ${isLargeText ? 'large' : 'normal'} text. Required: ${aaRequired}:1`,
            foreground: fgColor,
            background: bgColor,
          });
        }
      }
    });

    // Check for missing alt text on images
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.alt && !img.getAttribute('role') === 'presentation') {
        audit.missingAltText++;
      }
    });

    if (audit.missingAltText > 0) {
      audit.issues.push({
        type: 'images',
        severity: 'error',
        message: `${audit.missingAltText} image(s) missing alt text`,
      });
    }

    // Check for missing form labels
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    inputs.forEach(input => {
      const hasLabel = input.id && document.querySelector(`label[for="${input.id}"]`);
      const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
      const hasPlaceholder = input.placeholder;

      if (!hasLabel && !hasAriaLabel && !hasPlaceholder) {
        audit.missingLabels++;
      }
    });

    if (audit.missingLabels > 0) {
      audit.issues.push({
        type: 'forms',
        severity: 'warning',
        message: `${audit.missingLabels} form field(s) missing labels`,
      });
    }

    // Check heading structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;

    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      audit.headingStructure.push({
        level,
        text: h.textContent?.trim().substring(0, 50) || '',
      });

      // Check for skipped heading levels
      if (level > previousLevel + 1 && previousLevel !== 0) {
        audit.issues.push({
          type: 'headings',
          severity: 'warning',
          message: `Heading level skipped from H${previousLevel} to H${level}`,
        });
      }
      previousLevel = level;
    });

    // Check if page has h1
    if (!document.querySelector('h1')) {
      audit.missingHeadings = true;
      audit.issues.push({
        type: 'headings',
        severity: 'warning',
        message: 'Page is missing an H1 heading',
      });
    }

    // Check for focus indicators
    const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const sampledFocusable = Array.from(focusableElements).slice(0, 10);

    sampledFocusable.forEach(el => {
      const computed = getComputedStyle(el);
      const outlineStyle = computed.outlineStyle;
      const outlineWidth = parseFloat(computed.outlineWidth) || 0;
      const boxShadow = computed.boxShadow;

      const hasFocusIndicator = (outlineStyle !== 'none' && outlineWidth > 0) ||
                                (boxShadow && boxShadow !== 'none');

      if (!hasFocusIndicator) {
        // Check for :focus styles in stylesheets (limited detection)
        audit.focusIndicators.push({
          element: el.tagName.toLowerCase(),
          hasVisible: false,
          outline: computed.outline,
        });
      }
    });

    // Count ARIA usage
    audit.ariaUsage.landmarks = document.querySelectorAll('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], main, nav, header, footer, aside').length;
    audit.ariaUsage.labels = document.querySelectorAll('[aria-label], [aria-labelledby]').length;
    audit.ariaUsage.describedBy = document.querySelectorAll('[aria-describedby]').length;
    audit.ariaUsage.live = document.querySelectorAll('[aria-live], [role="alert"], [role="status"]').length;

    // Calculate overall score (simplified)
    const totalIssues = audit.issues.length;
    const errors = audit.issues.filter(i => i.severity === 'error').length;
    const warnings = audit.issues.filter(i => i.severity === 'warning').length;

    audit.summary = {
      totalIssues,
      errors,
      warnings,
      score: Math.max(0, 100 - (errors * 15) - (warnings * 5)),
      passesMinimumAA: errors === 0,
    };

    // Limit contrast results
    audit.colorContrast = audit.colorContrast.slice(0, 20);

    return audit;
  });
}

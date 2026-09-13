/* Renders every public page in jsdom against a live test server and asserts
   the dynamic sections hydrate from the JSON API. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';
import { loadPage, loadModule, sleep } from './helpers/dom.mjs';

const server = await startTestServer();
test.after(() => server.stop());

const PAGES = [
  ['index.html', '/', 'js/pages/home.js', (d) => {
    assert.ok(d.querySelectorAll('#featured-trips .trip-card').length >= 4, 'featured trips');
    assert.ok(d.querySelectorAll('#destinations-grid .dest-card').length >= 6, 'destination cards');
    assert.ok(d.querySelectorAll('#testimonials-grid .testimonial').length >= 3, 'testimonials');
    assert.ok(d.querySelectorAll('#home-faq .accordion__item').length >= 3, 'faqs');
    assert.match(d.querySelector('[data-stat="happyTravelers"]')?.textContent || '', /\d/, 'stats');
  }],
  ['destinations.html', '/destinations', 'js/pages/destinations.js', (d) => {
    assert.ok(d.querySelectorAll('#destinations-grid .dest-card').length >= 6, 'destination grid');
    assert.ok(d.querySelectorAll('#destination-filters .chip').length >= 4, 'region chips');
  }],
  ['destination.html', '/destination/alula', 'js/pages/destination.js', (d) => {
    assert.ok((d.getElementById('destination-name')?.textContent || '').length > 2, 'destination name');
    assert.ok(d.querySelectorAll('#destination-trips .trip-card').length >= 1, 'destination trips');
  }],
  ['packages.html', '/packages', 'js/pages/packages.js', (d) => {
    assert.ok(d.querySelectorAll('#packages-grid .trip-card').length >= 6, 'package cards');
    assert.ok(d.querySelectorAll('#filter-destination option').length >= 6, 'filter options');
  }],
  ['package.html', '/trip/alula-heritage-3-days', 'js/pages/package.js', (d) => {
    assert.ok((d.getElementById('trip-title')?.textContent || '').length > 5, 'package title');
    assert.ok(d.querySelectorAll('#trip-itinerary .timeline__item').length >= 2, 'itinerary');
    assert.ok(d.querySelectorAll('#trip-highlights li').length >= 3, 'highlights');
    assert.match(d.getElementById('card-price')?.textContent || '', /\d/, 'price');
    assert.ok(d.querySelectorAll('#related-trips .trip-card').length >= 1, 'related trips');
  }],
  ['about.html', '/about', 'js/pages/about.js', (d) => {
    assert.match(d.querySelector('[data-stat="destinations"]')?.textContent || '', /\d/, 'stats');
    assert.ok(d.querySelectorAll('.milestone').length >= 4, 'milestones');
  }],
  ['booking.html', '/booking?package=alula-heritage-3-days', 'js/pages/booking.js', (d) => {
    assert.equal(d.getElementById('bf-package')?.value, 'alula-heritage-3-days', 'deep-linked package');
    assert.ok(d.querySelectorAll('#bf-package option').length >= 8, 'package options');
  }],
  ['contact.html', '/contact', 'js/pages/contact.js', (d) => {
    assert.ok(d.getElementById('contact-form'), 'contact form');
    assert.ok(d.querySelectorAll('.contact-method').length >= 3, 'contact methods');
  }],
  ['faq.html', '/faq', 'js/pages/faq.js', (d) => {
    assert.ok(d.querySelectorAll('#faq-list .accordion__item').length >= 6, 'faq items');
    assert.ok(d.querySelectorAll('#faq-topics .chip').length >= 3, 'topic chips');
  }],
  ['privacy.html', '/privacy', 'js/pages/static.js', (d) => {
    assert.ok(d.querySelectorAll('.prose').length >= 10, 'privacy sections');
  }],
  ['404.html', '/nope', 'js/pages/notfound.js', (d) => {
    assert.ok(d.querySelectorAll('#popular-trips .trip-card').length >= 3, 'popular trips');
  }],
];

for (const [page, url, module, checks] of PAGES) {
  test(`page renders: ${page}`, async () => {
    const { document, consoleErrors } = loadPage(page, server.origin, url);
    await loadModule(module);
    await sleep(900);
    checks(document);
    assert.deepEqual(consoleErrors, [], `console errors on ${page}`);
  });
}

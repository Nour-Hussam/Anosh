/**
 * Seeds the site with realistic bilingual content: destinations, trips,
 * reviews, FAQs and a handful of demo leads so the dashboard is not empty.
 *
 *   npm run seed            → skips if content already exists
 *   npm run seed -- --force → wipes and re-seeds everything
 */
import { closeDb, getDb } from './index.js';
import { insertDestination, insertFaq, insertTestimonial } from '../repositories/content.js';
import { insertPackage } from '../repositories/packages.js';
import { addSubscriber, createBooking, createMessage } from '../repositories/leads.js';
import { updateSiteSettings } from '../repositories/settings.js';
import logger from '../utils/logger.js';

const force = process.argv.includes('--force');
const db = getDb();

const existingPackages = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
const existingDestinations = db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c;

if (!force && existingPackages > 0 && existingDestinations > 0) {
  // eslint-disable-next-line no-console
  console.log('ℹ️  Content already present — nothing to do. Use `npm run seed -- --force` to re-seed.');
  closeDb();
  process.exit(0);
}

if (force) {
  for (const table of ['packages', 'destinations', 'testimonials', 'faqs', 'bookings', 'messages', 'subscribers', 'settings']) {
    db.prepare(`DELETE FROM ${table}`).run();
    try {
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
    } catch {
      /* sqlite_sequence does not exist yet */
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Destinations                                                       */
/* ------------------------------------------------------------------ */

const DESTINATIONS = [
  {
    slug: 'alula',
    name: { ar: 'العُلا', en: 'AlUla' },
    region: { ar: 'منطقة المدينة المنورة', en: 'Al Madinah Province' },
    tagline: { ar: 'متحف حيّ على مساحة 22 ألف كيلومتر', en: 'A living museum across 22,000 km²' },
    description: {
      ar: 'العُلا هي جوهرة الشمال الغربي: مدائن صالح (الحِجر) أول موقع سعودي على قائمة اليونسكو، صخور نحتتها الرياح على هيئة أفيال وأقواس، وواحة نخيل عمرها آلاف السنين. نزور المقابر النبطية عند الشروق، ونقضي المساء في جبل الفيل أو في سماء مرصد المنارة.',
      en: 'AlUla is the jewel of the north-west: Hegra (Mada’in Salih), Saudi Arabia’s first UNESCO World Heritage site, wind-carved rocks shaped like elephants and arches, and a palm oasis thousands of years old. We visit the Nabataean tombs at sunrise and end the day at Elephant Rock or under the stars of the Manara observatory.',
    },
    image: '/images/hero-alula.jpg',
    bestSeason: { ar: 'أكتوبر – أبريل', en: 'October – April' },
    highlights: {
      ar: ['الحِجر (مدائن صالح)', 'جبل الفيل', 'البلدة القديمة', 'صخرة عكمة والفنون الصخرية', 'مراية وملتقى الفنون'],
      en: ['Hegra (Mada’in Salih)', 'Elephant Rock', 'AlUla Old Town', 'Jabal Ikmah rock inscriptions', 'Maraya & the arts quarter'],
    },
    sortOrder: 1,
  },
  {
    slug: 'riyadh-diriyah',
    name: { ar: 'الرياض والدرعية', en: 'Riyadh & Diriyah' },
    region: { ar: 'منطقة الرياض', en: 'Riyadh Province' },
    tagline: { ar: 'من قلب نجد إلى أبراج العاصمة', en: 'From the heart of Najd to the capital’s skyline' },
    description: {
      ar: 'الدرعية، عاصمة الدولة السعودية الأولى وموقع الطريف المسجّل في اليونسكو، بطرازها النجدي الطيني المثلث النوافذ. نجمعها مع الرياض الحديثة: برج المملكة، المتحف الوطني، وسوق الزل لتجربة القهوة السعودية والتمور.',
      en: 'Diriyah, first capital of the Saudi state and home of the UNESCO-listed At-Turaif quarter, with its triangular-windowed Najdi mud-brick architecture. We pair it with modern Riyadh: Kingdom Centre, the National Museum and Souq Al Zal for Saudi coffee and dates.',
    },
    image: '/images/dest-riyadh.jpg',
    bestSeason: { ar: 'نوفمبر – مارس', en: 'November – March' },
    highlights: {
      ar: ['حي الطريف التاريخي', 'المتحف الوطني', 'برج المملكة وسكاي بريدج', 'سوق الزل', 'وادي حنيفة'],
      en: ['At-Turaif historic quarter', 'National Museum', 'Kingdom Centre Sky Bridge', 'Souq Al Zal', 'Wadi Hanifah'],
    },
    sortOrder: 2,
  },
  {
    slug: 'red-sea',
    name: { ar: 'سواحل البحر الأحمر', en: 'Red Sea Coast' },
    region: { ar: 'منطقة مكة المكرمة وتبوك', en: 'Makkah & Tabuk Provinces' },
    tagline: { ar: 'شعاب مرجانية بكر ومياه بلون الفيروز', en: 'Pristine reefs and turquoise water' },
    description: {
      ar: 'من جدة شمالاً إلى أملج والوجه: جزر رملية، شعاب مرجانية من الأجمل عالمياً، وغوص مع السلاحف وأسماك القرش الحوتية في موسمها. رحلاتنا تشمل يختاً خاصاً ومدربي غوص معتمدين PADI.',
      en: 'From Jeddah north to Umluj and Al Wajh: sandbank islands, some of the world’s finest coral reefs, and dives with turtles and seasonal whale sharks. Our trips use private yachts and PADI-certified instructors.',
    },
    image: '/images/dest-redsea.jpg',
    bestSeason: { ar: 'أبريل – نوفمبر', en: 'April – November' },
    highlights: {
      ar: ['غوص وسنوركل في أملج', 'جزر الفشت', 'رحلة يخت خاصة', 'القرش الحوتي (موسمي)', 'تجربة صيد تقليدية'],
      en: ['Diving & snorkelling in Umluj', 'Al Fushut islands', 'Private yacht charter', 'Seasonal whale sharks', 'Traditional fishing experience'],
    },
    sortOrder: 3,
  },
  {
    slug: 'asir-abha',
    name: { ar: 'عسير وأبها', en: 'Asir & Abha' },
    region: { ar: 'منطقة عسير', en: 'Asir Province' },
    tagline: { ar: 'جبال خضراء وضباب وقرى معلّقة', en: 'Green peaks, mist and clifftop villages' },
    description: {
      ar: 'أعلى قمم المملكة، مدرجات خضراء، غابات عرعر، وقرى رجال المع الحجرية الملونة. جو معتدل صيفاً، وطلعة السودة فوق السحاب، مع تجربة العسل البلدي والخبز العسيري.',
      en: 'The Kingdom’s highest peaks, green terraces, juniper forests and the painted stone village of Rijal Almaa. Cool summers, the Soudah above the clouds, plus local honey and Asiri bread.',
    },
    image: '/images/dest-asir.jpg',
    bestSeason: { ar: 'مايو – سبتمبر', en: 'May – September' },
    highlights: {
      ar: ['جبل السودة والتلفريك', 'قرية رجال المع', 'متحف عسير', 'مدرجات الحبلة', 'سوق الثلاثاء الشعبي'],
      en: ['Jabal Soudah & cable car', 'Rijal Almaa village', 'Asir Museum', 'Habala terraces', 'Tuesday folk market'],
    },
    sortOrder: 4,
  },
  {
    slug: 'neom-tabuk',
    name: { ar: 'نيوم وتبوك', en: 'NEOM & Tabuk' },
    region: { ar: 'منطقة تبوك', en: 'Tabuk Province' },
    tagline: { ar: 'حيث يلتقي المستقبل بالصحراء', en: 'Where the future meets the desert' },
    description: {
      ar: 'شمال غرب المملكة: وادي الديسة بأعمدته الصخرية، جبل اللوز وثلوجه النادرة، خليج نيوم على البحر، وطريق الحج القديم. رحلاتنا بمركبات دفع رباعي ومرشدين من أبناء المنطقة.',
      en: 'The far north-west: Wadi Al Disah with its rock pillars, snow-dusted Jabal Al Lawz, NEOM’s gulf coastline and the old pilgrimage road. 4x4 convoys with guides born in the region.',
    },
    image: '/images/dest-neom.jpg',
    bestSeason: { ar: 'أكتوبر – مارس', en: 'October – March' },
    highlights: {
      ar: ['وادي الديسة', 'جبل اللوز', 'شاطئ نيوم', 'قلعة تبوك', 'مدائن شعيب'],
      en: ['Wadi Al Disah', 'Jabal Al Lawz', 'NEOM beach', 'Tabuk Castle', 'Mada’in Shu’ayb'],
    },
    sortOrder: 5,
  },
  {
    slug: 'al-ahsa',
    name: { ar: 'الأحساء', en: 'Al Ahsa' },
    region: { ar: 'المنطقة الشرقية', en: 'Eastern Province' },
    tagline: { ar: 'أكبر واحة نخيل في العالم', en: 'The largest palm oasis on Earth' },
    description: {
      ar: 'واحة مسجّلة في اليونسكو، أكثر من مليوني نخلة، بحيرة الأصفر، عين الحقل، وسوق القيصرية التاريخي. تجربة عائلية هادئة تجمع الزراعة والحرف والطبخ الأحسائي.',
      en: 'A UNESCO oasis of over two million palms: Al Asfar lake, Ain Al Haraq, and the historic Al Qaisariyah souq. A gentle family trip blending farming, crafts and Ahsa cuisine.',
    },
    image: '/images/dest-alahsa.jpg',
    bestSeason: { ar: 'نوفمبر – مارس', en: 'November – March' },
    highlights: {
      ar: ['سوق القيصرية', 'بحيرة الأصفر', 'جبل القارة', 'عين الحقل', 'قصر إبراهيم'],
      en: ['Al Qaisariyah Souq', 'Al Asfar Lake', 'Jebel Al Qarah', 'Ain Al Haraq', 'Ibrahim Palace'],
    },
    sortOrder: 6,
  },
  {
    slug: 'taif',
    name: { ar: 'الطائف', en: 'Taif' },
    region: { ar: 'منطقة مكة المكرمة', en: 'Makkah Province' },
    tagline: { ar: 'مدينة الورد ومصيف المملكة', en: 'The city of roses and summer capital' },
    description: {
      ar: 'مزارع الورد الطائفي، مصنع التقطير، جبل الشفا والهدا، وقصر شبرا. نزورها في موسم القطاف (مارس–أبريل) لتجربة التقطير والعطور، أو صيفاً للهروب من الحر.',
      en: 'Taif rose farms, distilleries, Jabal Al Shafa and Al Hada, and Shubra Palace. Best during the March–April harvest for distilling and perfumery, or in summer to escape the heat.',
    },
    image: '/images/dest-taif.jpg',
    bestSeason: { ar: 'مارس – أبريل', en: 'March – April' },
    highlights: {
      ar: ['مزارع الورد والتقطير', 'جبل الشفا', 'تلفريك الهدا', 'سوق عكاظ', 'قرية الكر السياحية'],
      en: ['Rose farms & distillery', 'Jabal Al Shafa', 'Al Hada cable car', 'Souq Okaz', 'Al Kur tourist village'],
    },
    sortOrder: 7,
  },
  {
    slug: 'jeddah-albalad',
    name: { ar: 'جدة التاريخية', en: 'Historic Jeddah' },
    region: { ar: 'منطقة مكة المكرمة', en: 'Makkah Province' },
    tagline: { ar: 'البلد: رواشين خشبية وحكايات بحر', en: 'Al Balad: wooden rawashin and sea stories' },
    description: {
      ar: 'جدة البلد المسجّلة في اليونسكو: بيوت من حجر البحر المنقبي، رواشين خشبية محفورة، أزقة معطرة بالبهارات، وكورنيش يطل على البحر الأحمر. جولة مشي مسائية مع مرشد من أبناء البلد.',
      en: 'UNESCO-listed Al Balad: coral-stone houses, carved wooden rawashin balconies, spice-scented alleyways and a Red Sea corniche. An evening walking tour with a guide born in the neighbourhood.',
    },
    image: '/images/dest-albalad.jpg',
    bestSeason: { ar: 'نوفمبر – مارس', en: 'November – March' },
    highlights: {
      ar: ['بيت نصيف التاريخي', 'سوق العلوي', 'مسجد الشافعي', 'كورنيش جدة', 'نافورة الملك فهد'],
      en: ['Nassif House', 'Souq Al Alawi', 'Al Shafi’i Mosque', 'Jeddah Corniche', 'King Fahd Fountain'],
    },
    sortOrder: 8,
  },
];

for (const d of DESTINATIONS) {
  insertDestination({
    slug: d.slug,
    name_ar: d.name.ar,
    name_en: d.name.en,
    region_ar: d.region.ar,
    region_en: d.region.en,
    tagline_ar: d.tagline.ar,
    tagline_en: d.tagline.en,
    description_ar: d.description.ar,
    description_en: d.description.en,
    image: d.image,
    best_season_ar: d.bestSeason.ar,
    best_season_en: d.bestSeason.en,
    highlights: d.highlights,
    active: 1,
    sort_order: d.sortOrder,
  });
}
// eslint-disable-next-line no-console
console.log(`✅ ${DESTINATIONS.length} destinations`);

/* ------------------------------------------------------------------ */
/*  Packages                                                           */
/* ------------------------------------------------------------------ */

const destId = (slug) => db.prepare('SELECT id FROM destinations WHERE slug = ?').get(slug)?.id ?? null;

const PACKAGES = [
  {
    slug: 'alula-heritage-3-days',
    destination: 'alula',
    title: { ar: 'أسرار العُلا: ٣ أيام بين الحِجر وجبل الفيل', en: 'AlUla Secrets: 3 Days of Hegra & Elephant Rock' },
    summary: {
      ar: 'جولة خاصة في أول موقع سعودي على قائمة اليونسكو، مع مخيم صحراوي فاخر وسماء مرصعة بالنجوم.',
      en: 'A private tour of Saudi Arabia’s first UNESCO site, with a luxury desert camp and star-filled skies.',
    },
    description: {
      ar: 'ثلاثة أيام برفقة مرشد أثري معتمد: الحِجر (مدائن صالح) عند الشروق بعيداً عن الزحام، جبل عكمة وكتابات قديمة عمرها 2500 سنة، البلدة القديمة ومتحف العلا، ثم ليلة في مخيم فاخر تحت السماء. تشمل الجولة سيارة خاصة ومرافقة تصوير.',
      en: 'Three days with a certified archaeological guide: Hegr (Mada’in Salih) at sunrise before the crowds, Jabal Ikmah and its 2,500-year-old inscriptions, the Old Town and AlUla museum, then a night in a luxury camp under the stars. Private vehicle and photo assistance included.',
    },
    region: { ar: 'شمال غرب السعودية', en: 'North-west Saudi Arabia' },
    days: 3,
    nights: 2,
    priceSar: 3950,
    oldPriceSar: 4600,
    groupSize: 12,
    difficulty: 'easy',
    category: 'guided',
    rating: 4.9,
    reviewsCount: 214,
    image: '/images/hero-alula.jpg',
    gallery: ['/images/hero-alula.jpg', '/images/desert-camp.jpg'],
    highlights: {
      ar: ['زيارة الحِجر مع مرشد أثري', 'غروب في جبل الفيل', 'ليلة مخيم فاخر', 'جولة البلدة القديمة بالدراجة', 'ورشة فنون صخرية'],
      en: ['Hegra with an archaeologist guide', 'Sunset at Elephant Rock', 'Luxury camp night', 'Old Town bicycle tour', 'Rock-art workshop'],
    },
    includes: {
      ar: ['إقامة ليلتين (فندق 4 نجوم + مخيم فاخر)', 'الإفطار والعشاء يومياً', 'سيارة خاصة ومرشد معتمد', 'تذاكر دخول المواقع', 'المياه والتمور طوال الرحلة', 'تأمين سفر أساسي'],
      en: ['Two nights (4* hotel + luxury camp)', 'Daily breakfast & dinner', 'Private vehicle and certified guide', 'All site entrance tickets', 'Water and dates throughout', 'Basic travel insurance'],
    },
    excludes: {
      ar: ['تذاكر الطيران', 'الغداء', 'المصاريف الشخصية', 'أنشطة اختيارية إضافية'],
      en: ['Flights', 'Lunch', 'Personal expenses', 'Optional extra activities'],
    },
    itinerary: [
      {
        day: 1,
        titleAr: 'الوصول وجبل الفيل',
        titleEn: 'Arrival & Elephant Rock',
        textAr: 'استقبال من مطار الأمير عبد المجيد بن عبد العزيز، انتقال إلى الفندق، ثم جلسة قهوة سعودية في جبل الفيل وقت الغروب.',
        textEn: 'Meet at Prince Abdul Majeed bin Abdulaziz Airport, transfer to the hotel, then Saudi coffee at Elephant Rock for sunset.',
      },
      {
        day: 2,
        titleAr: 'الحِجر وجبل عكمة',
        titleEn: 'Hegra & Jabal Ikmah',
        textAr: 'انطلاق قبل الشروق إلى مدائن صالح: مقبرة قصر الفريد، ديوان جبل إثلب، ثم جبل عكمة (مكتبة العُلا المفتوحة). المساء في المخيم الفاخر.',
        textEn: 'Depart before sunrise for Mada’in Salih: Qasr Al Farid tomb, the Diwan at Jabal Ithlib, then Jabal Ikmah (AlUla’s open-air library). Evening at the luxury camp.',
      },
      {
        day: 3,
        titleAr: 'البلدة القديمة والمغادرة',
        titleEn: 'Old Town & departure',
        textAr: 'جولة مشي في البلدة القديمة وسوق الدرب، ورشة فنون قصيرة، ثم انتقال إلى المطار.',
        textEn: 'Walking tour of the Old Town and Al Durb souq, a short art workshop, then transfer to the airport.',
      },
    ],
    featured: 1,
    sortOrder: 1,
  },
  {
    slug: 'riyadh-diriyah-city-break',
    destination: 'riyadh-diriyah',
    title: { ar: 'الرياض والدرعية: يومان بين التاريخ والمدينة', en: 'Riyadh & Diriyah: A Two-Day City Break' },
    summary: {
      ar: 'عطلة قصيرة في العاصمة: الطريف النجدي، المتحف الوطني، برج المملكة وسوق الزل.',
      en: 'A short capital escape: Najdi At-Turaif, the National Museum, Kingdom Centre and Souq Al Zal.',
    },
    description: {
      ar: 'يومان مكثفان في الرياض: نبدأ بالدرعية وجولة في حي الطريف مع راوي تاريخ، ثم المتحف الوطني، وفي المساء سكاي بريدج برج المملكة. اليوم الثاني لسوق الزل والقهوة السعودية وحي الملقا الحديث.',
      en: 'Two packed days in Riyadh: starting in Diriyah with a storyteller-led walk through At-Turaif, then the National Museum and the Kingdom Centre Sky Bridge at dusk. Day two covers Souq Al Zal, Saudi coffee and the modern Al Malqa district.',
    },
    region: { ar: 'وسط السعودية', en: 'Central Saudi Arabia' },
    days: 2,
    nights: 1,
    priceSar: 1850,
    oldPriceSar: null,
    groupSize: 16,
    difficulty: 'easy',
    category: 'family',
    rating: 4.8,
    reviewsCount: 156,
    image: '/images/dest-riyadh.jpg',
    gallery: ['/images/dest-riyadh.jpg', '/images/hospitality.jpg'],
    highlights: {
      ar: ['حي الطريف المسجّل في اليونسكو', 'المتحف الوطني', 'سكاي بريدج برج المملكة', 'سوق الزل والقهوة السعودية', 'عشاء نجدي تقليدي'],
      en: ['UNESCO At-Turaif quarter', 'National Museum', 'Kingdom Centre Sky Bridge', 'Souq Al Zal & Saudi coffee', 'Traditional Najdi dinner'],
    },
    includes: {
      ar: ['ليلة في فندق 4 نجوم', 'الإفطار وعشاء نجدي', 'مرشد سياحي مرخّص', 'التنقلات بسيارة مكيفة', 'تذاكر المتحف وسكاي بريدج'],
      en: ['One night in a 4* hotel', 'Breakfast & Najdi dinner', 'Licensed tour guide', 'Air-conditioned transfers', 'Museum & Sky Bridge tickets'],
    },
    excludes: { ar: ['تذاكر الطيران', 'الغداء', 'المصاريف الشخصية'], en: ['Flights', 'Lunch', 'Personal expenses'] },
    itinerary: [
      {
        day: 1,
        titleAr: 'الدرعية والطريف',
        titleEn: 'Diriyah & At-Turaif',
        textAr: 'استقبال، جولة في الطريف وقصر سلوى، ثم عشاء في بوجبة الدرعية.',
        textEn: 'Pickup, At-Turaif and Salwa Palace tour, dinner in Diriyah’s Bujairi Terrace.',
      },
      {
        day: 2,
        titleAr: 'المتحف وسوق الزل',
        titleEn: 'Museum & Souq Al Zal',
        textAr: 'المتحف الوطني صباحاً، سكاي بريدج وقت الغروب، ثم سوق الزل والمغادرة.',
        textEn: 'National Museum in the morning, Sky Bridge at sunset, then Souq Al Zal and departure.',
      },
    ],
    featured: 1,
    sortOrder: 2,
  },
  {
    slug: 'red-sea-diving-escape',
    destination: 'red-sea',
    title: { ar: 'البحر الأحمر: ٤ أيام غوص وجزر', en: 'Red Sea Escape: 4 Days of Diving & Islands' },
    summary: {
      ar: 'يخت خاص في أملج، شعاب بكر، وغوص مع مدرب معتمد — مناسب للمبتدئين والمحترفين.',
      en: 'A private yacht in Umluj, untouched reefs and a certified instructor — beginners welcome.',
    },
    description: {
      ar: 'أربعة أيام على متن يخت خاص من أملج: جزر الفشت، شعاب مرجانية صافية، سنوركل يومي، وغوصتان مع مدرب PADI. تشمل الرحلة تدريب الغطس للمبتدئين (Discover Scuba) ومعدات كاملة.',
      en: 'Four days aboard a private yacht out of Umluj: Al Fushut islands, crystal reefs, daily snorkelling and two dives with a PADI instructor. Includes Discover Scuba training for beginners and full equipment.',
    },
    region: { ar: 'ساحل البحر الأحمر', en: 'Red Sea Coast' },
    days: 4,
    nights: 3,
    priceSar: 4600,
    oldPriceSar: 5200,
    groupSize: 8,
    difficulty: 'moderate',
    category: 'adventure',
    rating: 4.9,
    reviewsCount: 98,
    image: '/images/dest-redsea.jpg',
    gallery: ['/images/dest-redsea.jpg'],
    highlights: {
      ar: ['يخت خاص لثماني أشخاص فقط', 'غوصتان مع مدرب PADI', 'جزر الفشت الرملية', 'عشاء مشويات على الشاطئ', 'معدات غطس كاملة'],
      en: ['Private yacht for just eight guests', 'Two dives with a PADI instructor', 'Al Fushut sandbanks', 'Beach barbecue dinner', 'Full dive equipment'],
    },
    includes: {
      ar: ['3 ليالي (فندق + ليلتان على اليخت)', 'جميع الوجبات', 'مدرب غوص معتمد', 'معدات الغطس والسنوركل', 'رسوم المحمية البحرية', 'التنقلات من وإلى جدة'],
      en: ['Three nights (hotel + two on the yacht)', 'All meals', 'Certified dive instructor', 'Dive & snorkel gear', 'Marine reserve fees', 'Transfers from/to Jeddah'],
    },
    excludes: { ar: ['تذاكر الطيران', 'شهادة الغوص الرسمية (اختياري)'], en: ['Flights', 'Official dive certification (optional)'] },
    itinerary: [
      { day: 1, titleAr: 'الوصول والاستعداد', titleEn: 'Arrival & briefing', textAr: 'استقبال في جدة والانتقال لأملج، شرح إجراءات السلامة والتجهيز.', textEn: 'Jeddah pickup and transfer to Umluj, safety briefing and gear fitting.' },
      { day: 2, titleAr: 'جزر الفشت', titleEn: 'Al Fushut islands', textAr: 'إبحار صباحي، سنوركل على الشعاب، وغداء على الشاطئ.', textEn: 'Morning sail, reef snorkelling and a beach lunch.' },
      { day: 3, titleAr: 'يوم الغوص', titleEn: 'Dive day', textAr: 'غوصتان بإشراف مدرب، وتصوير تحت الماء، وعشاء مشويات.', textEn: 'Two instructor-led dives, underwater photos and a barbecue dinner.' },
      { day: 4, titleAr: 'العودة', titleEn: 'Return', textAr: 'فطور متأخر وعودة إلى جدة.', textEn: 'Late breakfast and return to Jeddah.' },
    ],
    featured: 1,
    sortOrder: 3,
  },
  {
    slug: 'asir-mountains-retreat',
    destination: 'asir-abha',
    title: { ar: 'عسير: استراحة الجبال الخضراء', en: 'Asir: A Green Mountain Retreat' },
    summary: {
      ar: 'أبها والسودة ورجال المع — جو معتدل، ضباب، وعسل بلدي.',
      en: 'Abha, Soudah and Rijal Almaa — cool air, mist and mountain honey.',
    },
    description: {
      ar: 'أربعة أيام في أعلى قمم المملكة: جبل السودة، قرية رجال المع التراثية، مدرجات الحبلة، وزيارة لمزرعة عسل بلدي. مناسبة للعائلات صيفاً حيث تنخفض الحرارة كثيراً.',
      en: 'Four days on the Kingdom’s highest peaks: Jabal Soudah, the heritage village of Rijal Almaa, the Habala terraces and a visit to a local honey farm. Ideal for families in summer when temperatures drop sharply.',
    },
    region: { ar: 'جنوب غرب السعودية', en: 'South-west Saudi Arabia' },
    days: 4, nights: 3,
    priceSar: 3400, oldPriceSar: null,
    groupSize: 14, difficulty: 'easy', category: 'family',
    rating: 4.7, reviewsCount: 87,
    image: '/images/dest-asir.jpg', gallery: ['/images/dest-asir.jpg'],
    highlights: {
      ar: ['تلفريك السودة', 'قرية رجال المع', 'مدرجات الحبلة', 'تذوق العسل البلدي', 'سوق الثلاثاء'],
      en: ['Soudah cable car', 'Rijal Almaa village', 'Habala terraces', 'Local honey tasting', 'Tuesday market'],
    },
    includes: {
      ar: ['3 ليالي في منتجع جبلي', 'الإفطار والعشاء', 'مرشد محلي', 'التنقلات والرحلات الجبلية', 'تذاكر التلفريك والمتحف'],
      en: ['Three nights in a mountain resort', 'Breakfast & dinner', 'Local guide', 'Mountain transfers', 'Cable car & museum tickets'],
    },
    excludes: { ar: ['تذاكر الطيران', 'الغداء'], en: ['Flights', 'Lunch'] },
    itinerary: [
      { day: 1, titleAr: 'أبها', titleEn: 'Abha', textAr: 'وصول وجولة في وسط أبها وبحيرة السد.', textEn: 'Arrival and a tour of downtown Abha and the dam lake.' },
      { day: 2, titleAr: 'السودة', titleEn: 'Soudah', textAr: 'صعود جبل السودة والتلفريك ونزهة في غابات العرعر.', textEn: 'Jabal Soudah, cable car and a juniper-forest walk.' },
      { day: 3, titleAr: 'رجال المع', titleEn: 'Rijal Almaa', textAr: 'زيارة القرية التراثية والمتحف وتذوق الخبز العسيري.', textEn: 'Heritage village, museum and Asiri bread tasting.' },
      { day: 4, titleAr: 'المغادرة', titleEn: 'Departure', textAr: 'سوق شعدي قصير ثم المطار.', textEn: 'Short market stop, then the airport.' },
    ],
    featured: 0, sortOrder: 4,
  },
  {
    slug: 'luxury-desert-camp',
    destination: 'alula',
    title: { ar: 'مخيم الصحراء الفاخر تحت النجوم', en: 'Luxury Desert Camp Under the Stars' },
    summary: {
      ar: 'ليلتان في خيمة خاصة بخدمات فندقية، عشاء بدوي، ورصد فلكي.',
      en: 'Two nights in a private serviced tent, Bedouin dinner and stargazing.',
    },
    description: {
      ar: 'تجربة قصيرة فاخرة: خيمة خاصة بحمام داخلي، مجلس عربي على السجاد والوسائد، عشاء مندي على النار، وجلسة رصد فلكي بالتلسكوب مع مرشد فلكي.',
      en: 'A short luxury escape: a private tent with en-suite bathroom, an Arabic majlis of rugs and cushions, mandi dinner over open fire, and a telescope stargazing session with an astronomy guide.',
    },
    region: { ar: 'صحراء العُلا', en: 'AlUla Desert' },
    days: 2, nights: 1,
    priceSar: 2750, oldPriceSar: 3100,
    groupSize: 6, difficulty: 'easy', category: 'luxury',
    rating: 5, reviewsCount: 64,
    image: '/images/desert-camp.jpg', gallery: ['/images/desert-camp.jpg', '/images/hero-alula.jpg'],
    highlights: {
      ar: ['خيمة خاصة بحمام داخلي', 'عشاء مندي على النار', 'رصد فلكي بالتلسكوب', 'ركوب الخيل وقت الشروق', 'جلسة عود وقهوة سعودية'],
      en: ['Private tent with en-suite', 'Open-fire mandi dinner', 'Telescope stargazing', 'Sunrise horse ride', 'Oud session & Saudi coffee'],
    },
    includes: {
      ar: ['ليلة في مخيم فاخر', 'جميع الوجبات', 'خدمة نقل خاصة', 'جلسة فلكية', 'أنشطة المخيم'],
      en: ['One night in a luxury camp', 'All meals', 'Private transfers', 'Astronomy session', 'All camp activities'],
    },
    excludes: { ar: ['تذاكر الطيران'], en: ['Flights'] },
    itinerary: [
      { day: 1, titleAr: 'المخيم والنجوم', titleEn: 'Camp & stars', textAr: 'وصول، مجلس ترحيبي، عشاء مندي، ثم رصد فلكي.', textEn: 'Arrival, welcome majlis, mandi dinner, then stargazing.' },
      { day: 2, titleAr: 'الشروق والمغادرة', titleEn: 'Sunrise & departure', textAr: 'ركوب خيل عند الشروق وفطور بدوي.', textEn: 'Sunrise horse ride and a Bedouin breakfast.' },
    ],
    featured: 1, sortOrder: 5,
  },
  {
    slug: 'al-ahsa-oasis-family',
    destination: 'al-ahsa',
    title: { ar: 'واحة الأحساء: رحلة عائلية', en: 'Al Ahsa Oasis: A Family Trip' },
    summary: {
      ar: 'نخيل، عيون ماء، سوق القيصرية، وحرف يدوية — مناسبة للأطفال.',
      en: 'Palms, springs, Al Qaisariyah souq and crafts — great with kids.',
    },
    description: {
      ar: 'ثلاثة أيام هادئة في أكبر واحة نخيل في العالم: جبل القارة وكهوفه الباردة، بحيرة الأصفر، عين الحقل، وسوق القيصرية التاريخي مع ورشة حرفية للأطفال.',
      en: 'Three relaxed days in the world’s largest palm oasis: Jebel Al Qarah and its cool caves, Al Asfar lake, Ain Al Haraq spring and the historic Al Qaisariyah souq with a kids’ craft workshop.',
    },
    region: { ar: 'المنطقة الشرقية', en: 'Eastern Province' },
    days: 3, nights: 2,
    priceSar: 2200, oldPriceSar: null,
    groupSize: 20, difficulty: 'easy', category: 'family',
    rating: 4.6, reviewsCount: 52,
    image: '/images/dest-alahsa.jpg', gallery: ['/images/dest-alahsa.jpg'],
    highlights: {
      ar: ['سوق القيصرية', 'كهوف جبل القارة', 'بحيرة الأصفر', 'ورشة حرفية للأطفال', 'تذوق الأرز الحساوي'],
      en: ['Al Qaisariyah Souq', 'Jebel Al Qarah caves', 'Al Asfar Lake', 'Kids’ craft workshop', 'Hasawi rice tasting'],
    },
    includes: {
      ar: ['ليلتان في فندق عائلي', 'الإفطار ووجبة أحسائية تقليدية', 'مرشد عائلي', 'التنقلات', 'ورشة الأطفال'],
      en: ['Two nights in a family hotel', 'Breakfast & an Ahsawi feast', 'Family-friendly guide', 'Transfers', 'Kids’ workshop'],
    },
    excludes: { ar: ['تذاكر الطيران', 'الغداء'], en: ['Flights', 'Lunch'] },
    itinerary: [
      { day: 1, titleAr: 'القيصرية', titleEn: 'Al Qaisariyah', textAr: 'وصول وجولة في السوق التاريخي والعشاء الأحسائي.', textEn: 'Arrival, historic souq tour and Ahsawi dinner.' },
      { day: 2, titleAr: 'جبل القارة والبحيرة', titleEn: 'Qarah & the lake', textAr: 'كهوف جبل القارة، بحيرة الأصفر، وورشة حرفية.', textEn: 'Qarah caves, Al Asfar lake and a craft workshop.' },
      { day: 3, titleAr: 'العيون والمغادرة', titleEn: 'Springs & departure', textAr: 'عين الحقل وقصر إبراهيم ثم المغادرة.', textEn: 'Ain Al Haraq and Ibrahim Palace, then departure.' },
    ],
    featured: 0, sortOrder: 6,
  },
  {
    slug: 'neom-future-vision',
    destination: 'neom-tabuk',
    title: { ar: 'نيوم وتبوك: رحلة المستقبل', en: 'NEOM & Tabuk: Journey to the Future' },
    summary: {
      ar: 'خمس أيام بمركبات دفع رباعي: وادي الديسة، جبل اللوز، وسواحل نيوم.',
      en: 'Five days by 4x4: Wadi Al Disah, Jabal Al Lawz and NEOM’s coast.',
    },
    description: {
      ar: 'رحلة استكشافية في أقصى الشمال الغربي بمركبات دفع رباعي ومرشد من أبناء تبوك: وادي الديسة بأعمدته الصخرية، جبل اللوز، قلعة تبوك، مدائن شعيب، ويوم على ساحل نيوم.',
      en: 'An expedition through the far north-west by 4x4 with a Tabuk-born guide: Wadi Al Disah and its rock pillars, Jabal Al Lawz, Tabuk Castle, Mada’in Shu’ayb and a day on NEOM’s coast.',
    },
    region: { ar: 'شمال غرب السعودية', en: 'North-west Saudi Arabia' },
    days: 5, nights: 4,
    priceSar: 6900, oldPriceSar: null,
    groupSize: 10, difficulty: 'active', category: 'adventure',
    rating: 4.8, reviewsCount: 41,
    image: '/images/dest-neom.jpg', gallery: ['/images/dest-neom.jpg'],
    highlights: {
      ar: ['مغامرة دفع رباعي في وادي الديسة', 'تخييم تحت النجوم', 'جبل اللوز', 'ساحل نيوم', 'مدائن شعيب'],
      en: ['4x4 adventure in Wadi Al Disah', 'Desert camping under stars', 'Jabal Al Lawz', 'NEOM coastline', 'Mada’in Shu’ayb'],
    },
    includes: {
      ar: ['4 ليالي (فندق + مخيم)', 'جميع الوجبات في البر', 'مركبات دفع رباعي وسائقين', 'مرشد متخصص', 'معدات التخييم', 'تصاريح المناطق'],
      en: ['Four nights (hotel + camp)', 'All desert meals', '4x4 vehicles and drivers', 'Specialist guide', 'Camping gear', 'Area permits'],
    },
    excludes: { ar: ['تذاكر الطيران', 'معدات التصوير الشخصية'], en: ['Flights', 'Personal camera gear'] },
    itinerary: [
      { day: 1, titleAr: 'تبوك', titleEn: 'Tabuk', textAr: 'وصول، قلعة تبوك، وسوق المدينة القديم.', textEn: 'Arrival, Tabuk Castle and the old town souq.' },
      { day: 2, titleAr: 'وادي الديسة', titleEn: 'Wadi Al Disah', textAr: 'انطلاق بالدفع الرباعي بين الأعمدة الصخرية والتخييم.', textEn: '4x4 convoy between rock pillars and overnight camp.' },
      { day: 3, titleAr: 'جبل اللوز', titleEn: 'Jabal Al Lawz', textAr: 'صعود الجبل ونقوشه القديمة.', textEn: 'Ascent of the mountain and its ancient inscriptions.' },
      { day: 4, titleAr: 'ساحل نيوم', titleEn: 'NEOM coast', textAr: 'يوم بحري على ساحل نيوم.', textEn: 'A beach day on the NEOM coast.' },
      { day: 5, titleAr: 'مدائن شعيب والمغادرة', titleEn: 'Mada’in Shu’ayb & departure', textAr: 'زيارة مدائن شعيب ثم العودة.', textEn: 'Visit Mada’in Shu’ayb, then return.' },
    ],
    featured: 1, sortOrder: 7,
  },
  {
    slug: 'taif-rose-season',
    destination: 'taif',
    title: { ar: 'الطائف: موسم قطف الورد', en: 'Taif: The Rose Harvest Season' },
    summary: {
      ar: 'يومان في مزارع الورد الطائفي ومعامل التقطير، مع جبل الشفا.',
      en: 'Two days in the Taif rose farms and distilleries, plus Jabal Al Shafa.',
    },
    description: {
      ar: 'رحلة موسمية (مارس–أبريل): قطف الورد مع المزارعين، مشاهدة التقطير التقليدي في المعمل، شراء ماء الورد الأصلي، ثم جولة في جبل الشفا وقرية الكر.',
      en: 'A seasonal trip (March–April): harvest roses with the farmers, watch traditional distilling, buy authentic rose water, then tour Jabal Al Shafa and Al Kur village.',
    },
    region: { ar: 'غرب السعودية', en: 'Western Saudi Arabia' },
    days: 2, nights: 1,
    priceSar: 1650, oldPriceSar: null,
    groupSize: 18, difficulty: 'easy', category: 'guided',
    rating: 4.7, reviewsCount: 73,
    image: '/images/dest-taif.jpg', gallery: ['/images/dest-taif.jpg'],
    highlights: {
      ar: ['قطف الورد مع المزارعين', 'معامل التقطير', 'قصر شبرا', 'جبل الشفا', 'سوق عكاظ'],
      en: ['Rose harvest with farmers', 'Distillery visit', 'Shubra Palace', 'Jabal Al Shafa', 'Souq Okaz'],
    },
    includes: {
      ar: ['ليلة في فندق بالطائف', 'الإفطار والعشاء', 'زيارة مزرعة ومعمل', 'قارورة ماء ورد هدية', 'التنقلات'],
      en: ['One night in a Taif hotel', 'Breakfast & dinner', 'Farm and distillery visit', 'A complimentary rose-water bottle', 'Transfers'],
    },
    excludes: { ar: ['تذاكر الطيران', 'الغداء'], en: ['Flights', 'Lunch'] },
    itinerary: [
      { day: 1, titleAr: 'مزارع الورد', titleEn: 'The rose farms', textAr: 'قطف الورد ومشاهدة التقطير وقصر شبرا.', textEn: 'Rose picking, distilling and Shubra Palace.' },
      { day: 2, titleAr: 'الشفا والمغادرة', titleEn: 'Al Shafa & departure', textAr: 'جولة جبل الشفا وقرية الكر ثم المغادرة.', textEn: 'Jabal Al Shafa and Al Kur village, then departure.' },
    ],
    featured: 0, sortOrder: 8,
  },
  {
    slug: 'jeddah-albalad-heritage-walk',
    destination: 'jeddah-albalad',
    title: { ar: 'جدة البلد: جولة تراثية مسائية', en: 'Historic Jeddah: An Evening Heritage Walk' },
    summary: {
      ar: 'ثلاث ساعات مشي بين الرواشين والبهارات مع مرشد من أبناء البلد.',
      en: 'Three walking hours among rawashin and spices with a local guide.',
    },
    description: {
      ar: 'جولة مشي مسائية في حي البلد المسجّل في اليونسكو: بيت نصيف، سوق العلوي، مسجد الشافعي، وحكايات التجار والبحر. تنتهي بعشاء على الكورنيش.',
      en: 'An evening walk through the UNESCO-listed Al Balad: Nassif House, Souq Al Alawi, Al Shafi’i Mosque and stories of merchants and the sea. Ends with dinner on the corniche.',
    },
    region: { ar: 'جدة', en: 'Jeddah' },
    days: 1, nights: 0,
    priceSar: 650, oldPriceSar: null,
    groupSize: 20, difficulty: 'easy', category: 'guided',
    rating: 4.8, reviewsCount: 132,
    image: '/images/dest-albalad.jpg', gallery: ['/images/dest-albalad.jpg'],
    highlights: {
      ar: ['بيت نصيف التاريخي', 'سوق العلوي والتوابل', 'حكايات البحر والتجارة', 'عشاء على الكورنيش', 'تصوير الرواشين'],
      en: ['Historic Nassif House', 'Souq Al Alawi & spices', 'Sea and merchant stories', 'Corniche dinner', 'Rawashin photography'],
    },
    includes: {
      ar: ['مرشد من أبناء البلد', 'عشاء خفيف على الكورنيش', 'المياه', 'نقطة التقاء وسط جدة'],
      en: ['Local neighbourhood guide', 'Light corniche dinner', 'Water', 'Central Jeddah meeting point'],
    },
    excludes: { ar: ['المواصلات إلى نقطة الالتقاء', 'المشتريات'], en: ['Transport to the meeting point', 'Shopping'] },
    itinerary: [
      { day: 1, titleAr: 'الجولة المسائية', titleEn: 'Evening walk', textAr: 'التجمع 5 عصراً، جولة 3 ساعات، ثم العشاء.', textEn: 'Meet at 5 PM, a three-hour walk, then dinner.' },
    ],
    featured: 0, sortOrder: 9,
  },
  {
    slug: 'grand-kingdom-tour',
    destination: 'alula',
    title: { ar: 'جولة المملكة الكبرى: ٨ أيام', en: 'The Grand Kingdom Tour: 8 Days' },
    summary: {
      ar: 'العُلا، الدرعية، البحر الأحمر، والعسل الجبلي — أفضل ما في السعودية في رحلة واحدة.',
      en: 'AlUla, Diriyah, the Red Sea and the mountains — Saudi Arabia’s best in one trip.',
    },
    description: {
      ar: 'رحلتنا الأشمل: ثمانية أيام من العُلا والحِجر إلى الدرعية والرياض، ثم البحر الأحمر للغوص، وتُختتم بمخيم فاخر تحت النجوم. تشمل رحلات داخلية ومرافق شخصي ومصور.',
      en: 'Our most complete journey: eight days from AlUla and Hegr to Diriyah and Riyadh, then the Red Sea for diving, closing with a luxury camp under the stars. Domestic flights, a personal host and a photographer included.',
    },
    region: { ar: 'جميع المناطق', en: 'All regions' },
    days: 8, nights: 7,
    priceSar: 11900, oldPriceSar: 13500,
    groupSize: 8, difficulty: 'moderate', category: 'luxury',
    rating: 5, reviewsCount: 29,
    image: '/images/hero-alula.jpg',
    gallery: ['/images/hero-alula.jpg', '/images/dest-riyadh.jpg', '/images/dest-redsea.jpg', '/images/desert-camp.jpg'],
    highlights: {
      ar: ['الحِجر والعُلا', 'الدرعية والرياض', 'غوص في البحر الأحمر', 'مخيم فاخر', 'مرافق شخصي ومصور', 'رحلات داخلية مشمولة'],
      en: ['Hegra & AlUla', 'Diriyah & Riyadh', 'Red Sea diving', 'Luxury camp', 'Personal host & photographer', 'Domestic flights included'],
    },
    includes: {
      ar: ['7 ليالي إقامة فاخرة', 'جميع الوجبات', 'الرحلات الداخلية', 'مرافق شخصي ومصور', 'كل التذاكر والتصاريح', 'تأمين سفر شامل'],
      en: ['Seven luxury nights', 'All meals', 'Domestic flights', 'Personal host & photographer', 'All tickets and permits', 'Comprehensive travel insurance'],
    },
    excludes: { ar: ['تذاكر الطيران الدولية', 'المصاريف الشخصية'], en: ['International flights', 'Personal expenses'] },
    itinerary: [
      { day: 1, titleAr: 'الوصول إلى الرياض', titleEn: 'Arrive in Riyadh', textAr: 'استقبال خاص وعشاء ترحيبي.', textEn: 'Private welcome and dinner.' },
      { day: 2, titleAr: 'الدرعية والطريف', titleEn: 'Diriyah & At-Turaif', textAr: 'جولة تاريخية في العاصمة الأولى.', textEn: 'Historic tour of the first capital.' },
      { day: 3, titleAr: 'طيران إلى العُلا', titleEn: 'Fly to AlUla', textAr: 'وصول وجبل الفيل عند الغروب.', textEn: 'Arrival and Elephant Rock at sunset.' },
      { day: 4, titleAr: 'الحِجر', titleEn: 'Hegra', textAr: 'مدائن صالح وجبل عكمة.', textEn: 'Mada’in Salih and Jabal Ikmah.' },
      { day: 5, titleAr: 'المخيم الفاخر', titleEn: 'Luxury camp', textAr: 'يوم في البر ورصد فلكي.', textEn: 'A desert day with stargazing.' },
      { day: 6, titleAr: 'إلى البحر الأحمر', titleEn: 'To the Red Sea', textAr: 'طيران إلى جدة والإبحار إلى أملج.', textEn: 'Fly to Jeddah and sail to Umluj.' },
      { day: 7, titleAr: 'غوص وجزر', titleEn: 'Diving & islands', textAr: 'غوصتان وجزر الفشت.', textEn: 'Two dives and the Al Fushut islands.' },
      { day: 8, titleAr: 'المغادرة', titleEn: 'Departure', textAr: 'فطور متأخر وتوديع خاص.', textEn: 'Late breakfast and private farewell.' },
    ],
    featured: 1, sortOrder: 10,
  },
];

for (const p of PACKAGES) {
  insertPackage({
    slug: p.slug,
    destination_id: destId(p.destination),
    title_ar: p.title.ar,
    title_en: p.title.en,
    summary_ar: p.summary.ar,
    summary_en: p.summary.en,
    description_ar: p.description.ar,
    description_en: p.description.en,
    region_ar: p.region.ar,
    region_en: p.region.en,
    days: p.days,
    nights: p.nights,
    price_sar: p.priceSar,
    old_price_sar: p.oldPriceSar ?? null,
    group_size: p.groupSize,
    difficulty: p.difficulty,
    category: p.category,
    rating: p.rating,
    reviews_count: p.reviewsCount,
    image: p.image,
    gallery: p.gallery,
    highlights: p.highlights,
    includes: p.includes,
    excludes: p.excludes,
    itinerary: p.itinerary,
    featured: p.featured,
    active: 1,
    sort_order: p.sortOrder,
  });
}
// eslint-disable-next-line no-console
console.log(`✅ ${PACKAGES.length} packages`);

/* ------------------------------------------------------------------ */
/*  Testimonials                                                       */
/* ------------------------------------------------------------------ */

const pkgId = (slug) => db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug)?.id ?? null;

const TESTIMONIALS = [
  {
    name: 'نورة العتيبي',
    city: { ar: 'الرياض', en: 'Riyadh' },
    rating: 5,
    text: {
      ar: 'أول مرة أحس إن في جهة منظمة فعلاً للسياحة الداخلية. المرشد في العُلا كان موسوعة متنقلة، والتنظيم دقيق بالدقيقة. رجعت بذكريات ما تُنسى.',
      en: 'The first time I felt a domestic tour was truly professional. Our AlUla guide was a walking encyclopaedia and the timing was exact. Unforgettable memories.',
    },
    packageId: pkgId('alula-heritage-3-days'),
    tripDate: '2025-11',
    sortOrder: 1,
  },
  {
    name: 'James Whitfield',
    city: { ar: 'لندن', en: 'London' },
    rating: 5,
    text: {
      ar: '',
      en: 'Booked the Grand Kingdom Tour for our honeymoon. Flawless logistics across four regions, and the desert camp night was the highlight of the whole trip.',
    },
    packageId: pkgId('grand-kingdom-tour'),
    tripDate: '2025-10',
    sortOrder: 2,
  },
  {
    name: 'عبد الله الغامدي',
    city: { ar: 'جدة', en: 'Jeddah' },
    rating: 5,
    text: {
      ar: 'رحلة الغوص في أملج كانت آمنة ومنظمة بشكل ممتاز. المدرب شرح كل شيء للمبتدئين وما حسّيت بأي قلق. يستاهل كل ريال.',
      en: 'The Umluj dive trip was safe and brilliantly organised. The instructor explained everything to beginners and I never felt anxious. Worth every riyal.',
    },
    packageId: pkgId('red-sea-diving-escape'),
    tripDate: '2025-09',
    sortOrder: 3,
  },
  {
    name: 'سارة الحمد',
    city: { ar: 'الدمام', en: 'Dammam' },
    rating: 4,
    text: {
      ar: 'أخذت العائلة في رحلة الأحساء، الأطفال انبسطوا جداً خصوصاً الورشة الحرفية. ملاحظتي الوحيدة إن اليوم الثاني كان مزدحماً شوي.',
      en: 'Took the family to Al Ahsa — the kids loved it, especially the craft workshop. Only note: day two felt a little packed.',
    },
    packageId: pkgId('al-ahsa-oasis-family'),
    tripDate: '2025-08',
    sortOrder: 4,
  },
  {
    name: 'Marco Bianchi',
    city: { ar: 'ميلانو', en: 'Milan' },
    rating: 5,
    text: {
      ar: '',
      en: 'As a photographer, AlUla at sunrise was a dream. The team knew exactly where to stand and when the light would hit Qasr Al Farid. Highly recommended.',
    },
    packageId: pkgId('alula-heritage-3-days'),
    tripDate: '2025-12',
    sortOrder: 5,
  },
  {
    name: 'منى الشهري',
    city: { ar: 'أبها', en: 'Abha' },
    rating: 5,
    text: {
      ar: 'رغم إني من أبها، اكتشفت أماكن ما زرتها قبل. المرشد من أهل المنطقة وكان كريم ومثقف. تجربة أنصح فيها كل عائلة.',
      en: 'Even as a local, I discovered places I had never visited. The guide was from the region — generous and knowledgeable. I recommend it to every family.',
    },
    packageId: pkgId('asir-mountains-retreat'),
    tripDate: '2025-07',
    sortOrder: 6,
  },
  {
    name: 'خالد المري',
    city: { ar: 'الدوحة', en: 'Doha' },
    rating: 5,
    text: {
      ar: 'حجزت مخيم الصحراء الفاخر لزوجتي في ذكرى زواجنا. الخدمة كانت على مستوى فنادق الخمس نجوم، والرصد الفلكي كان لحظة ما تنسى.',
      en: 'Booked the luxury desert camp for our anniversary. Five-star service and the stargazing session was a moment we will never forget.',
    },
    packageId: pkgId('luxury-desert-camp'),
    tripDate: '2026-01',
    sortOrder: 7,
  },
  {
    name: 'Aisha Rahman',
    city: { ar: 'كوالالمبور', en: 'Kuala Lumpur' },
    rating: 5,
    text: {
      ar: '',
      en: 'The Diriyah city break was perfect for a short visit. Everything was handled in English and Arabic, and the Najdi dinner was outstanding.',
    },
    packageId: pkgId('riyadh-diriyah-city-break'),
    tripDate: '2026-02',
    sortOrder: 8,
  },
];

for (const t of TESTIMONIALS) {
  insertTestimonial({
    name: t.name,
    city_ar: t.city.ar,
    city_en: t.city.en,
    rating: t.rating,
    text_ar: t.text.ar,
    text_en: t.text.en,
    package_id: t.packageId,
    trip_date: t.tripDate,
    active: 1,
    sort_order: t.sortOrder,
  });
}
// eslint-disable-next-line no-console
console.log(`✅ ${TESTIMONIALS.length} testimonials`);

/* ------------------------------------------------------------------ */
/*  FAQs                                                               */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    question: { ar: 'هل أحتاج تأشيرة لدخول السعودية؟', en: 'Do I need a visa to enter Saudi Arabia?' },
    answer: {
      ar: 'مواطنو 63 دولة يمكنهم استخراج التأشيرة السياحية إلكترونياً أو عند الوصول عبر منصة "روح السعودية". لمواطني دول مجلس التعاون الخليجي لا تُطلب تأشيرة. فريقنا يرسل لك رابط الطلب وشرح الخطوات بعد تأكيد الحجز.',
      en: 'Citizens of 63 countries can obtain a tourist eVisa online or on arrival via the Visit Saudi platform. GCC nationals do not need a visa. After your booking is confirmed our team sends you the application link and step-by-step instructions.',
    },
    topic: 'visa',
    sortOrder: 1,
  },
  {
    question: { ar: 'كيف أدفع؟ وهل الدفع آمن؟', en: 'How do I pay, and is it secure?' },
    answer: {
      ar: 'نقبل مدى، فيزا، ماستركارد، أبل باي، والتحويل البنكي. الدفع يتم عبر بوابة دفع مرخّصة من البنك المركزي السعودي، ولا نخزّن أي بيانات بطاقة على موقعنا إطلاقاً. نطلب عادةً 30% عربون والباقي قبل الرحلة بسبعة أيام.',
      en: 'We accept mada, Visa, Mastercard, Apple Pay and bank transfer. Payments run through a Saudi Central Bank licensed gateway and we never store card data on this website. Typically a 30% deposit is required, with the balance due seven days before departure.',
    },
    topic: 'payment',
    sortOrder: 2,
  },
  {
    question: { ar: 'ما سياسة الإلغاء والتعديل؟', en: 'What is your cancellation policy?' },
    answer: {
      ar: 'الإلغاء قبل 30 يوماً: استرداد كامل. من 15 إلى 30 يوماً: 75%. من 7 إلى 15 يوماً: 50%. أقل من 7 أيام: لا يوجد استرداد، لكن يمكن تحويل المبلغ كرصيد لرحلة أخرى خلال سنة. التأشيرات والتصاريح غير مستردة.',
      en: 'Cancel 30+ days ahead for a full refund; 15–30 days for 75%; 7–15 days for 50%; under 7 days is non-refundable, though the amount can be kept as credit for another trip within a year. Visa and permit fees are non-refundable.',
    },
    topic: 'booking',
    sortOrder: 3,
  },
  {
    question: { ar: 'هل الرحلات مناسبة للعائلات والأطفال؟', en: 'Are the trips suitable for families and children?' },
    answer: {
      ar: 'نعم. باقات "عائلية" مصممة لأطفال من سن 4 سنوات، مع مرشد مدرب وتوقيت مرن وفترات راحة. الأطفال دون 12 سنة يحصلون على خصم 25%، ودون 3 سنوات مجاناً بدون مقعد.',
      en: 'Yes. Our "family" trips are designed for children from age four, with trained guides, flexible timing and rest breaks. Children under 12 get 25% off, and under-3s travel free without a seat.',
    },
    topic: 'booking',
    sortOrder: 4,
  },
  {
    question: { ar: 'ماذا أرتدي خلال الرحلة؟', en: 'What should I wear?' },
    answer: {
      ar: 'ملابس محتشمة ومريحة للجنسين: أكمام تغطي الكتف وأطوال تحت الركبة. النساء لسن مطالبات بغطاء الرأس إلا في المواقع الدينية. في الرحلات الجبلية والصحراوية ننصح بطبقات، قبعة، نظارة شمسية، وحذاء مشي مغلق.',
      en: 'Comfortable, modest clothing for everyone: shoulders covered and hemlines below the knee. Women are not required to cover their hair except at religious sites. For mountain and desert trips bring layers, a hat, sunglasses and closed walking shoes.',
    },
    topic: 'general',
    sortOrder: 5,
  },
  {
    question: { ar: 'هل المرشدون مرخّصون؟ وبأي لغة؟', en: 'Are your guides licensed, and in which languages?' },
    answer: {
      ar: 'جميع مرشدينا حاصلون على ترخيص من وزارة السياحة السعودية. الجولات متوفرة بالعربية والإنجليزية، وبالحجز المسبق بالفرنسية والأردو والروسية. مرشدو الجبال والغوص معتمدون دولياً.',
      en: 'All our guides are licensed by the Saudi Ministry of Tourism. Tours run in Arabic and English, and with advance notice in French, Urdu and Russian. Mountain and dive guides hold international certifications.',
    },
    topic: 'general',
    sortOrder: 6,
  },
  {
    question: { ar: 'هل السعر يشمل الطيران؟', en: 'Are flights included in the price?' },
    answer: {
      ar: 'الرحلات الداخلية بين المناطق مشمولة في "جولة المملكة الكبرى" فقط. باقي الباقات لا تشمل الطيران الدولي، ويمكن لفريقنا حجز الرحلات الداخلية نيابةً عنك بسعر التكلفة.',
      en: 'Domestic flights are included only in the Grand Kingdom Tour. Other packages exclude international flights, though our team can book domestic legs at cost on your behalf.',
    },
    topic: 'payment',
    sortOrder: 7,
  },
  {
    question: { ar: 'هل يوجد تأمين على الرحلة؟', en: 'Is travel insurance included?' },
    answer: {
      ar: 'جميع باقاتنا تشمل تأميناً أساسياً ضد الحوادث أثناء الأنشطة. ننصح بشدة بشراء تأمين سفر شامل يغطي الإلغاء الطبي والطوارئ من بلدك قبل السفر.',
      en: 'All packages include basic activity accident cover. We strongly recommend comprehensive travel insurance from your home country that covers medical emergencies and cancellation.',
    },
    topic: 'general',
    sortOrder: 8,
  },
  {
    question: { ar: 'كم عدد المشاركين في الرحلة؟', en: 'How many people join a trip?' },
    answer: {
      ar: 'الحد الأقصى مذكور في كل باقة (بين 6 و20 مشاركاً). يمكنك أيضاً طلب رحلة خاصة لك ولعائلتك فقط بدون أي رسوم إضافية على الرحلات التي لا تتجاوز أربعة أشخاص.',
      en: 'The maximum is stated on each package (between 6 and 20 guests). You can also request a fully private trip at no extra cost for groups of up to four.',
    },
    topic: 'booking',
    sortOrder: 9,
  },
  {
    question: { ar: 'هل تنظمون رحلات للمجموعات والشركات؟', en: 'Do you organise group and corporate trips?' },
    answer: {
      ar: 'نعم، لدينا قسم متخصص لرحلات الشركات والحوافز والمؤتمرات حتى 300 شخص، مع فواتير ضريبية رسمية وبرامج مخصصة. تواصل معنا عبر نموذج "الشراكات" وسنرسل عرضاً خلال 48 ساعة.',
      en: 'Yes — we have a dedicated MICE and incentive desk for up to 300 people, with official VAT invoices and custom agendas. Contact us through the "Partnership" form and we will send a proposal within 48 hours.',
    },
    topic: 'groups',
    sortOrder: 10,
  },
];

for (const f of FAQS) {
  insertFaq({
    question_ar: f.question.ar,
    question_en: f.question.en,
    answer_ar: f.answer.ar,
    answer_en: f.answer.en,
    topic: f.topic,
    active: 1,
    sort_order: f.sortOrder,
  });
}
// eslint-disable-next-line no-console
console.log(`✅ ${FAQS.length} FAQs`);

/* ------------------------------------------------------------------ */
/*  Site settings                                                      */
/* ------------------------------------------------------------------ */

updateSiteSettings({
  brand: { ar: 'رحلات المملكة', en: 'Kingdom Journeys' },
  tagline: {
    ar: 'اكتشف السعودية مع أهلها — رحلات مصممة بعناية، ومرشدون مرخّصون من وزارة السياحة',
    en: 'Discover Saudi Arabia with locals — carefully designed trips and Ministry-licensed guides',
  },
});

/* ------------------------------------------------------------------ */
/*  Demo leads (so the dashboard is not empty on first run)            */
/* ------------------------------------------------------------------ */

const fakeReq = { socket: { remoteAddress: '203.0.113.7' }, headers: { 'user-agent': 'seed-script' } };
fakeReq.get = (h) => fakeReq.headers[h.toLowerCase()];

const DEMO_BOOKINGS = [
  ['أحمد الزهراني', 'ahmed.z@example.com', '+966551234567', 'Saudi Arabia', 'alula-heritage-3-days', 2, 1, 'new'],
  ['Layla Haddad', 'layla.h@example.com', '+971501112233', 'UAE', 'grand-kingdom-tour', 2, 0, 'confirmed'],
  ['محمد الشمري', 'm.alshammari@example.com', '+966503334444', 'Saudi Arabia', 'red-sea-diving-escape', 4, 2, 'contacted'],
  ['Sophie Laurent', 'sophie.l@example.com', '+33612345678', 'France', 'luxury-desert-camp', 2, 0, 'confirmed'],
  ['خالد العنزي', 'khalid.a@example.com', '+96550123456', 'Kuwait', 'riyadh-diriyah-city-break', 3, 1, 'new'],
  ['فاطمة القحطاني', 'fatima.q@example.com', '+97433112233', 'Qatar', 'asir-mountains-retreat', 5, 2, 'completed'],
  ['Daniel Osei', 'daniel.o@example.com', '+447700900123', 'United Kingdom', 'neom-future-vision', 2, 0, 'cancelled'],
  ['ريم الدوسري', 'reem.d@example.com', '+966533221100', 'Saudi Arabia', 'taif-rose-season', 2, 0, 'new'],
];

for (const [name, email, phone, country, slug, adults, children, status] of DEMO_BOOKINGS) {
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);
  const booking = createBooking(
    {
      packageId: pkg?.id,
      fullName: name,
      email,
      phone,
      country,
      adults,
      children,
      travelDate: '2026-10-12',
      preferredContact: 'whatsapp',
      notes: 'طلب تجريبي تم إنشاؤه بواسطة سكربت البذر — يمكن حذفه من لوحة التحكم.',
      lang: /[^\x00-\x7F]/.test(name) ? 'ar' : 'en',
      consent: true,
    },
    fakeReq
  );
  if (status !== 'new') db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, booking.id);
}
// eslint-disable-next-line no-console
console.log(`✅ ${DEMO_BOOKINGS.length} demo bookings`);

const DEMO_MESSAGES = [
  ['سلمى إبراهيم', 'salma.i@example.com', '+966561112222', 'booking', 'استفسار عن رحلة العُلا', 'السلام عليكم، هل توجد رحلة في شهر ديسمبر لعائلة من ٥ أشخاص؟ وما هي طريقة الدفع المتاحة؟'],
  ['Tom Baker', 'tom.baker@example.com', '', 'general', 'Visa question', 'Hello, I am a UK citizen travelling in November. Do you assist with the tourist eVisa application?'],
  ['شركة أفق للمقاولات', 'hr@ofok-contracting.example', '+966112345678', 'partnership', 'طلب عرض لرحلة موظفين', 'نرغب في عرض سعر لرحلة تحفيزية لـ 40 موظفاً في الربع الأول، مع إقامة 3 ليالي.'],
  ['نوف السبيعي', 'nouf.s@example.com', '', 'support', 'تعديل موعد الحجز', 'لدي حجز برقم KJ-XXXXXX وأرغب في تأجيله أسبوعين إذا كان ذلك ممكناً.'],
  ['Marie Dubois', 'marie.dubois@example.com', '+33698765432', 'groups', 'Group of 12', 'Bonjour, we are a group of 12 friends. Can you arrange a private departure of the Red Sea trip?'],
];

for (const [name, email, phone, topic, subject, message] of DEMO_MESSAGES) {
  createMessage({ name, email, phone, topic, subject, message, lang: /[^\x00-\x7F]/.test(message) ? 'ar' : 'en', spam: false }, fakeReq);
}

const DEMO_SUBSCRIBERS = [
  ['visitor1@example.com', 'ar'],
  ['visitor2@example.com', 'en'],
  ['visitor3@example.com', 'ar'],
  ['visitor4@example.com', 'en'],
  ['visitor5@example.com', 'ar'],
  ['visitor6@example.com', 'en'],
];
for (const [email, lang] of DEMO_SUBSCRIBERS) addSubscriber({ email, lang }, fakeReq);

// eslint-disable-next-line no-console
console.log(`✅ ${DEMO_MESSAGES.length} demo messages, ${DEMO_SUBSCRIBERS.length} newsletter subscribers`);

closeDb();
// eslint-disable-next-line no-console
console.log('\n🎉 Seeding complete. Start the server with: npm start\n');

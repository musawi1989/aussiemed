/**
 * TEST CATALOGUE — NOT REAL AUSSIEMED DATA.
 *
 * Sixty products seeded from the public catalogues of two Australian
 * suppliers, so the storefront can be evaluated against realistic products
 * instead of invented ones.
 *
 * What was taken: factual product data only — name, brand, pack size, unit and
 * price. Descriptions are generated here rather than copied, and no supplier
 * imagery is used. Every entry is flagged isPlaceholder in the catalogue and
 * badged in the UI.
 *
 * Prices are the source AUD figure converted at 2.42 AED, which is
 * approximate and for testing only. Volume breaks are generated, not real.
 *
 * Replace wholesale when the client's own price list arrives — see DA-01 in
 * docs/issue-register.csv.
 *
 * Regenerate: this file is committed, not built. Edit it directly.
 */

export const AUD_TO_AED = 2.42;

export const TEST_SUPPLIERS = [
  { id: 30, name: "Livingstone", isPlaceholder: true },
  { id: 31, name: "Chemist Warehouse", isPlaceholder: true },
];

export const SUPPLIER_IDS = {
  Livingstone: 30,
  "Chemist Warehouse": 31,
};

export const TEST_PRODUCTS = [
  { supplier: "Livingstone", name: "Universal Nitrile Examination Gloves, AS NZ Standard, Powder Free, EN374, Large, Blue Colour, HACCP Grade, ...", brand: "Universal Choice", categoryId: 81, priceAED: 28.48, unit: "Box", packSize: "100 Pieces", tiers: [[6, 27.34], [24, 26.49]], sourceSku: "GLVNRLPFL", sourcePriceAUD: 11.77 },
  { supplier: "Livingstone", name: "Livingstone Gauze Swabs Non-Sterile", brand: "Livingstone", categoryId: 60, priceAED: 3.73, unit: "Each", packSize: null, tiers: [[12, 3.58], [48, 3.43]], sourceSku: "GS050H", sourcePriceAUD: 1.54 },
  { supplier: "Livingstone", name: "Livingstone Hypodermic Needles", brand: "Livingstone", categoryId: 46, priceAED: 120.88, unit: "Each", packSize: null, tiers: [[3, 117.25], [10, 113.63]], sourceSku: "DN14GX1.5LV", sourcePriceAUD: 49.95 },
  { supplier: "Livingstone", name: "Livingstone Plastic Transfer Pipette", brand: "Livingstone", categoryId: 71, priceAED: 159.6, unit: "Each", packSize: null, tiers: [[3, 154.81], [10, 150.02]], sourceSku: "PTP01-01P", sourcePriceAUD: 65.95 },
  { supplier: "Livingstone", name: "Sofeel Vinyl Gloves, Recyclable, 5.0g, Low Powder, Large, Blue, HACCP Grade, 100/Box", brand: "Sofeel", categoryId: 81, priceAED: 11.98, unit: "Box", packSize: "100 Pieces", tiers: [[12, 11.5], [48, 11.02]], sourceSku: "GLVN100LB", sourcePriceAUD: 4.95 },
  { supplier: "Livingstone", name: "Liv-Wipe Mini Alcohol Swabs, Prep Pad, 70 Percent Isopropyl Alcohol Sanitiser, 62 x 30mm, Gamma Sterilised,...", brand: "Liv-Wipe", categoryId: 33, priceAED: 3.99, unit: "Box", packSize: "100 Pieces", tiers: [[12, 3.83], [48, 3.67]], sourceSku: "LWMS-1", sourcePriceAUD: 1.65 },
  { supplier: "Livingstone", name: "Livingstone Scalpel with Handle", brand: "Livingstone", categoryId: 111, priceAED: 43.92, unit: "Each", packSize: null, tiers: [[6, 42.16], [24, 40.85]], sourceSku: "SCP10", sourcePriceAUD: 18.15 },
  { supplier: "Livingstone", name: "Ni-Tek Nitrile Premium Gloves, AS NZ Standard, Powder Free, EN374, Large, Blue Colour, HACCP Grade, 100/Box", brand: "Ni-Tek", categoryId: 81, priceAED: 32.74, unit: "Box", packSize: "100 Pieces", tiers: [[6, 31.43], [24, 30.45]], sourceSku: "GLVNTRPF100L-M", sourcePriceAUD: 13.53 },
  { supplier: "Livingstone", name: "Livingstone Hot and Cold Pack", brand: "Livingstone", categoryId: 60, priceAED: 21.18, unit: "Each", packSize: null, tiers: [[6, 20.33], [24, 19.7]], sourceSku: "HCP150X300N", sourcePriceAUD: 8.75 },
  { supplier: "Livingstone", name: "Livingstone Insulin Syringes, 0.3ml, with White Plunger, with Needle 31 Gauge x 0.32 Inch, 8mm, Sterile, 10...", brand: "Livingstone", categoryId: 49, priceAED: 77.32, unit: "Box", packSize: "100 Pieces", tiers: [[6, 74.23], [24, 71.91]], sourceSku: "DSL0003ML29G", sourcePriceAUD: 31.95 },
  { supplier: "Livingstone", name: "Sofeel Mini Biodegradable Wooden Spatula, 140 x 6.2 x 1.3 mm, 100/Pack", brand: "Sofeel", categoryId: 77, priceAED: 4.28, unit: "Each", packSize: null, tiers: [[12, 4.11], [48, 3.94]], sourceSku: "BROWBEAT", sourcePriceAUD: 1.77 },
  { supplier: "Livingstone", name: "Livingstone Gauze Swabs Sterile", brand: "Livingstone", categoryId: 60, priceAED: 290.16, unit: "Each", packSize: null, tiers: [[3, 281.46], [10, 272.75]], sourceSku: "GSS075X1P", sourcePriceAUD: 119.9 },
  { supplier: "Livingstone", name: "Liv-Wipe Large Alcohol Swabs Prep Pad", brand: "Liv-Wipe", categoryId: 140, priceAED: 7.07, unit: "Each", packSize: null, tiers: [[12, 6.79], [48, 6.5]], sourceSku: "LWMS6", sourcePriceAUD: 2.92 },
  { supplier: "Livingstone", name: "Livingstone Urine Reagent Multi Test Strips for Urinalysis, 10 Parameters plus Specific Gravity, 100 Tests/...", brand: "Livingstone", categoryId: 60, priceAED: 116.04, unit: "Each", packSize: null, tiers: [[3, 112.56], [10, 109.08]], sourceSku: "MULTISTX10LIV", sourcePriceAUD: 47.95 },
  { supplier: "Livingstone", name: "Universal Skin Shield Biodegradable Latex Examination Gloves, ASTM, Powder Free, Large, Cream Colour, HACCP...", brand: "Skin Shield", categoryId: 81, priceAED: 24.9, unit: "Box", packSize: "100 Pieces", tiers: [[6, 23.9], [24, 23.16]], sourceSku: "GLPF100ZL", sourcePriceAUD: 10.29 },
  { supplier: "Livingstone", name: "Livingstone Basic Wound Dressing Packs", brand: "Livingstone", categoryId: 60, priceAED: 2.71, unit: "Each", packSize: null, tiers: [[12, 2.6], [48, 2.49]], sourceSku: "DRSPKB", sourcePriceAUD: 1.12 },
  { supplier: "Livingstone", name: "Livingstone Syringe, 3ml, Luer Lock Tip, Latex Free, Hypoallergenic, Non-Sterile, Loose Each", brand: "Livingstone", categoryId: 49, priceAED: 0.34, unit: "Each", packSize: "3ml", tiers: [[12, 0.33], [48, 0.31]], sourceSku: "DS003MLLTL", sourcePriceAUD: 0.14 },
  { supplier: "Livingstone", name: "Livingstone Premium Pathology Grade Microscope Glass Slide", brand: "Livingstone", categoryId: 71, priceAED: 10.53, unit: "Each", packSize: null, tiers: [[12, 10.11], [48, 9.69]], sourceSku: "7101-1C", sourcePriceAUD: 4.35 },
  { supplier: "Livingstone", name: "Myerson Dura Post #30SLL/G (1X8 Card) Each Card", brand: "Livingstone", categoryId: 135, priceAED: 33.15, unit: "Each", packSize: null, tiers: [[6, 31.82], [24, 30.83]], sourceSku: "MYEPD30SLLG", sourcePriceAUD: 13.7 },
  { supplier: "Livingstone", name: "Liv-Wipe Mini Alcohol Swabs, Prep Pad, 70 Percent Isopropyl Alcohol Sanitiser, 62 x 30mm, Gamma Sterilised,...", brand: "Liv-Wipe", categoryId: 33, priceAED: 4.72, unit: "Box", packSize: "100 Pieces", tiers: [[12, 4.53], [48, 4.34]], sourceSku: "LWMSS", sourcePriceAUD: 1.95 },
  { supplier: "Livingstone", name: "Universal Body Razor, Double Edge, 90mm Handle, Blue, 100/Box", brand: "Universal Choice", categoryId: 111, priceAED: 135.37, unit: "Box", packSize: "100 Pieces", tiers: [[3, 131.31], [10, 127.25]], sourceSku: "PRZR-DSTDC", sourcePriceAUD: 55.94 },
  { supplier: "Livingstone", name: "Livingstone Xtreme Thick Heavy Duty Nitrile Gloves, Powder Free, EN374, Large, Black, 100/Box", brand: "Livingstone Xtreme", categoryId: 81, priceAED: 34.61, unit: "Box", packSize: "100 Pieces", tiers: [[6, 33.23], [24, 32.19]], sourceSku: "GLVNRLB100L", sourcePriceAUD: 14.3 },
  { supplier: "Livingstone", name: "Livingstone Emesis Vomit Bag, 1500ml, in Patented Dispenser, 50 pieces/Box", brand: "Livingstone", categoryId: 60, priceAED: 66.43, unit: "Box", packSize: "50 Pieces", tiers: [[6, 63.77], [24, 61.78]], sourceSku: "EMESISBGN-50", sourcePriceAUD: 27.45 },
  { supplier: "Livingstone", name: "Livingstone Underpad Barrier Pads", brand: "Livingstone", categoryId: 51, priceAED: 142.78, unit: "Each", packSize: null, tiers: [[3, 138.5], [10, 134.21]], sourceSku: "UPAD55640", sourcePriceAUD: 59 },
  { supplier: "Livingstone", name: "Bomex Beaker Low Form", brand: "Bomex", categoryId: 71, priceAED: 9.83, unit: "Each", packSize: null, tiers: [[12, 9.44], [48, 9.04]], sourceSku: "1101-0050", sourcePriceAUD: 4.06 },
  { supplier: "Livingstone", name: "BD Ultra-Fine Insulin Syringes, 0.3ml, with Needle 29 Gauge x 0.5 Inch, 12.7mm, Sterile, 100 Pieces/Box", brand: "Embecta", categoryId: 49, priceAED: 84.58, unit: "Box", packSize: "100 Pieces", tiers: [[6, 81.2], [24, 78.66]], sourceSku: "BD326103", sourcePriceAUD: 34.95 },
  { supplier: "Livingstone", name: "Sofeel Premium Compact Towel", brand: "Sofeel", categoryId: 140, priceAED: 154.4, unit: "Each", packSize: null, tiers: [[3, 149.77], [10, 145.14]], sourceSku: "KIM4440N", sourcePriceAUD: 63.8 },
  { supplier: "Livingstone", name: "Livingstone Surgical Preparation Razor Blade with Handle", brand: "Livingstone", categoryId: 111, priceAED: 15.05, unit: "Each", packSize: null, tiers: [[12, 14.45], [48, 13.85]], sourceSku: "PRZR-DSTDA", sourcePriceAUD: 6.22 },
  { supplier: "Livingstone", name: "Ni-Tek Nitrile Premium Examination Gloves, AS NZ Standard, Powder Free, EN374, Large, Blue, HACCP Grade, 10...", brand: "Ni-Tek", categoryId: 81, priceAED: 32.74, unit: "Box", packSize: "100 Pieces", tiers: [[6, 31.43], [24, 30.45]], sourceSku: "GLVNTRPF100L", sourcePriceAUD: 13.53 },
  { supplier: "Livingstone", name: "Livingstone Adhesive Fabric First Aid Strips with Pad", brand: "Livingstone", categoryId: 60, priceAED: 4.67, unit: "Each", packSize: null, tiers: [[12, 4.48], [48, 4.3]], sourceSku: "ASF7318025", sourcePriceAUD: 1.93 },
  { supplier: "Chemist Warehouse", name: "Elastoplast Flexible Fabric Strips Assorted 40 Pack", brand: "Elastoplast", categoryId: 60, priceAED: 10.87, unit: "Pack", packSize: "40 Pieces", tiers: [[12, 10.44], [48, 10]], sourceSku: null, sourcePriceAUD: 4.49 },
  { supplier: "Chemist Warehouse", name: "Roger Armstrong Mobi 2-in-1 Digital Baby Thermometer and Pulse Reader 1pc", brand: null, categoryId: 111, priceAED: 96.78, unit: "Pack", packSize: "1 Pieces", tiers: [[6, 92.91], [24, 90.01]], sourceSku: null, sourcePriceAUD: 39.99 },
  { supplier: "Chemist Warehouse", name: "Aqium Antibacterial Hand Sanitiser Ultra 375Ml", brand: "Aqium", categoryId: 33, priceAED: 19.34, unit: "Each", packSize: "375ml", tiers: [[12, 18.57], [48, 17.79]], sourceSku: null, sourcePriceAUD: 7.99 },
  { supplier: "Chemist Warehouse", name: "La Roche Posay Anthelios Invisible Fluid SPF 50+ 50ml", brand: null, categoryId: 63, priceAED: 67.74, unit: "Each", packSize: "50ml", tiers: [[6, 65.03], [24, 63]], sourceSku: null, sourcePriceAUD: 27.99 },
  { supplier: "Chemist Warehouse", name: "Health & Wellness Dental Tongue Cleaner Stainless Steel", brand: null, categoryId: 34, priceAED: 21.76, unit: "Each", packSize: null, tiers: [[6, 20.89], [24, 20.24]], sourceSku: null, sourcePriceAUD: 8.99 },
  { supplier: "Chemist Warehouse", name: "Jumper Upper Arm Auto Blood Pressure Monitor - Extra Large Backlit LCD 1Unit", brand: null, categoryId: 111, priceAED: 157.3, unit: "Each", packSize: null, tiers: [[3, 152.58], [10, 147.86]], sourceSku: null, sourcePriceAUD: 65 },
  { supplier: "Chemist Warehouse", name: "Elastoplast Wound Spray 100ml", brand: "Elastoplast", categoryId: 60, priceAED: 21.76, unit: "Each", packSize: "100ml", tiers: [[6, 20.89], [24, 20.24]], sourceSku: null, sourcePriceAUD: 8.99 },
  { supplier: "Chemist Warehouse", name: "Welcare Digital Thermometer Standard", brand: "Welcare", categoryId: 111, priceAED: 20.55, unit: "Each", packSize: null, tiers: [[6, 19.73], [24, 19.11]], sourceSku: null, sourcePriceAUD: 8.49 },
  { supplier: "Chemist Warehouse", name: "Goat Antibacterial Hand Sanitiser Alcohol 300ml", brand: "Goat Soap", categoryId: 33, priceAED: 19.34, unit: "Each", packSize: "300ml", tiers: [[12, 18.57], [48, 17.79]], sourceSku: null, sourcePriceAUD: 7.99 },
  { supplier: "Chemist Warehouse", name: "Neutrogena Ultra Sheer Face Lotion Sunscreen SPF 50 88ml", brand: "Neutrogena", categoryId: 63, priceAED: 26.6, unit: "Each", packSize: "88ml", tiers: [[6, 25.54], [24, 24.74]], sourceSku: null, sourcePriceAUD: 10.99 },
  { supplier: "Chemist Warehouse", name: "Hismile Stain iD Mouthwash 237ml", brand: "HiSmile", categoryId: 95, priceAED: 30.23, unit: "Each", packSize: "237ml", tiers: [[6, 29.02], [24, 28.11]], sourceSku: null, sourcePriceAUD: 12.49 },
  { supplier: "Chemist Warehouse", name: "Salter Automatic Arm Blood Pressure Monitor", brand: "Salter", categoryId: 111, priceAED: 96.78, unit: "Each", packSize: null, tiers: [[6, 92.91], [24, 90.01]], sourceSku: null, sourcePriceAUD: 39.99 },
  { supplier: "Chemist Warehouse", name: "Stingose Spray Pack 25mL", brand: "Stingose", categoryId: 60, priceAED: 22.97, unit: "Each", packSize: "25ml", tiers: [[6, 22.05], [24, 21.36]], sourceSku: null, sourcePriceAUD: 9.49 },
  { supplier: "Chemist Warehouse", name: "Famidoc Touch-less Forehead Infrared Thermometer", brand: "Famidoc", categoryId: 111, priceAED: 145.18, unit: "Each", packSize: null, tiers: [[3, 140.82], [10, 136.47]], sourceSku: null, sourcePriceAUD: 59.99 },
  { supplier: "Chemist Warehouse", name: "Goat Antibacterial Hand Sanitiser Alcohol Spray 120ml", brand: "Goat Soap", categoryId: 33, priceAED: 14.5, unit: "Each", packSize: "120ml", tiers: [[12, 13.92], [48, 13.34]], sourceSku: null, sourcePriceAUD: 5.99 },
  { supplier: "Chemist Warehouse", name: "Cancer Council SPF 50+ Ultra 250ml Tube", brand: "Cancer Council", categoryId: 63, priceAED: 45.96, unit: "Each", packSize: "250ml", tiers: [[6, 44.12], [24, 42.74]], sourceSku: null, sourcePriceAUD: 18.99 },
  { supplier: "Chemist Warehouse", name: "Therabreath Icy Mint Oral Rinse 473ml", brand: "TheraBreath", categoryId: 95, priceAED: 41.12, unit: "Each", packSize: "473ml", tiers: [[6, 39.48], [24, 38.24]], sourceSku: null, sourcePriceAUD: 16.99 },
  { supplier: "Chemist Warehouse", name: "Omron HEM7120 Blood Pressure Monitor", brand: "Omron", categoryId: 111, priceAED: 210.52, unit: "Each", packSize: null, tiers: [[3, 204.2], [10, 197.89]], sourceSku: null, sourcePriceAUD: 86.99 },
  { supplier: "Chemist Warehouse", name: "Liv-Wipe 70% Alcohol Swabs Prep Pad - Mini 100pcs", brand: "Liv-Wipe", categoryId: 140, priceAED: 9.66, unit: "Pack", packSize: "100 Pieces", tiers: [[12, 9.27], [48, 8.89]], sourceSku: null, sourcePriceAUD: 3.99 },
  { supplier: "Chemist Warehouse", name: "Vicks Insight Thermometer", brand: "Vicks", categoryId: 111, priceAED: 60.48, unit: "Each", packSize: null, tiers: [[6, 58.06], [24, 56.25]], sourceSku: null, sourcePriceAUD: 24.99 },
  { supplier: "Chemist Warehouse", name: "Hello Kitty Hand Sanitiser 35ml", brand: "Hello", categoryId: 33, priceAED: 10.87, unit: "Each", packSize: "35ml", tiers: [[12, 10.44], [48, 10]], sourceSku: null, sourcePriceAUD: 4.49 },
  { supplier: "Chemist Warehouse", name: "Hamilton SPF 50+ Everyday Face Cream 75g", brand: "Hamilton", categoryId: 63, priceAED: 28.29, unit: "Each", packSize: "75g", tiers: [[6, 27.16], [24, 26.31]], sourceSku: null, sourcePriceAUD: 11.69 },
  { supplier: "Chemist Warehouse", name: "Hismile V34 Teeth Whitening Strips 14 Pack", brand: "HiSmile", categoryId: 60, priceAED: 47.19, unit: "Pack", packSize: "14 Pieces", tiers: [[6, 45.3], [24, 43.89]], sourceSku: null, sourcePriceAUD: 19.5 },
  { supplier: "Chemist Warehouse", name: "Omron HEM7121 Standard Blood Pressure Monitor", brand: "Omron", categoryId: 111, priceAED: 278.28, unit: "Each", packSize: null, tiers: [[3, 269.93], [10, 261.58]], sourceSku: null, sourcePriceAUD: 114.99 },
  { supplier: "Chemist Warehouse", name: "Savlon Antiseptic Cream for Cuts Grazes Bites 50g", brand: "Savlon", categoryId: 61, priceAED: 20.55, unit: "Each", packSize: "50g", tiers: [[6, 19.73], [24, 19.11]], sourceSku: null, sourcePriceAUD: 8.49 },
  { supplier: "Chemist Warehouse", name: "Welcare 2 In 1 Ear Thermometer", brand: "Welcare", categoryId: 111, priceAED: 128.24, unit: "Each", packSize: null, tiers: [[3, 124.39], [10, 120.55]], sourceSku: null, sourcePriceAUD: 52.99 },
  { supplier: "Chemist Warehouse", name: "Aqium Antibacterial Hand Sanitiser Ultra 60Ml", brand: "Aqium", categoryId: 33, priceAED: 8.45, unit: "Each", packSize: "60ml", tiers: [[12, 8.11], [48, 7.77]], sourceSku: null, sourcePriceAUD: 3.49 },
  { supplier: "Chemist Warehouse", name: "La Roche-Posay Anthelios ULTRA SPF50+ Face Sunscreen For Dry Skin 50ml", brand: null, categoryId: 63, priceAED: 67.74, unit: "Each", packSize: "50ml", tiers: [[6, 65.03], [24, 63]], sourceSku: null, sourcePriceAUD: 27.99 },
  { supplier: "Chemist Warehouse", name: "White Glo Flossers Tight Fit Mint 100 Pack", brand: "White Glo", categoryId: 95, priceAED: 19.34, unit: "Pack", packSize: "100 Pieces", tiers: [[12, 18.57], [48, 17.79]], sourceSku: null, sourcePriceAUD: 7.99 },
  { supplier: "Chemist Warehouse", name: "Salter Automatic Wrist Blood Pressure Monitor", brand: "Salter", categoryId: 111, priceAED: 96.78, unit: "Each", packSize: null, tiers: [[6, 92.91], [24, 90.01]], sourceSku: null, sourcePriceAUD: 39.99 },
];

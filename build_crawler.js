/**
 * HoYo Character Build Crawler
 * Otomatis mencari dan memperbarui build karakter terbaru dari Game8
 * untuk Genshin Impact, Honkai: Star Rail, dan Zenless Zone Zero.
 */

const fs = require('fs');
const path = require('path');

const BUILDS_PATH = path.join(__dirname, 'data', 'builds.json');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MASTER_PAGES = [
  { game: 'genshin', url: 'https://game8.co/games/Genshin-Impact/archives/530535' },
  { game: 'hsr', url: 'https://game8.co/games/Honkai-Star-Rail/archives/633162' },
  { game: 'zzz', url: 'https://game8.co/games/Zenless-Zone-Zero/archives/522597' }
];

function cleanCharName(raw) {
  return raw
    .replace(/^(Genshin\s*Impact|Honkai\s*Star\s*Rail|Zenless\s*Zone\s*Zero)\s*[-–—:]\s*/i, '')
    .replace(/\s*(Best\s*Builds?|Build\s*Guide|Builds?|Rating|and\s*Teams?|Icon|Image).*$/i, '')
    .trim();
}

function parseGame8Auto(html) {
  let weapons = [];
  let artifacts = [];
  let stats = [];

  const cleanHtml = html.replace(/<template[\s\S]*?<\/template>/gi, '');
  const tables = [...cleanHtml.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];

  for (const t of tables) {
    const tableHtml = t[1];
    const plainText = tableHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();

    const isBuildTable =
      (plainText.includes('best weapon') || plainText.includes('best light cone') || plainText.includes('best w-engine')) ||
      (plainText.includes('best artifact') || plainText.includes('relics') || plainText.includes('drive disc'));

    if (!isBuildTable) continue;

    const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let currentMainStats = [];

    for (let i = 0; i < rows.length; i++) {
      const rowContent = rows[i][1];
      const ths = [...rowContent.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase());
      const tds = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];

      // Pattern 1: Row with th and td
      if (ths.length > 0 && tds.length > 0) {
        const header = ths[0];
        const aMatches = [...tds[0][1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim()).filter(x => x && !x.startsWith('http'));
        const tdText = tds[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        if (header.includes('best weapon') || header.includes('best light cone') || header.includes('best w-engine')) {
          if (aMatches.length > 0) {
            weapons.push(`• **BiS**: ${aMatches[0]}`);
            if (aMatches.length > 1) weapons.push(`• **Alternatif/F2P**: ${aMatches.slice(1).join(', ')}`);
          } else if (tdText) weapons.push(`• **BiS**: ${tdText}`);
        } else if (header.includes('alt') || header.includes('replacement') || header.includes('substitute')) {
          if (aMatches.length > 0) weapons.push(`• **Alternatif/F2P**: ${aMatches.join(', ')}`);
          else if (tdText) weapons.push(`• **Alternatif/F2P**: ${tdText}`);
        } else if (header.includes('artifact stat') || header.includes('relic stat')) {
          const subIdx = tdText.toLowerCase().indexOf('sub stat');
          if (subIdx !== -1) {
            const mainP = tdText.slice(0, subIdx).trim();
            const subP = tdText.slice(subIdx).replace(/artifact\s*sub\s*stats?:?/i, '').replace(/sub\s*stats?:?/i, '').trim();
            if (mainP) stats.push(`• **Main Stats**: ${mainP}`);
            if (subP) stats.push(`• **Substats**: ${subP}`);
          } else if (tdText) {
            stats.push(`• **Main Stats**: ${tdText}`);
          }
        } else if (header.includes('main stat')) {
          if (tdText) currentMainStats.push(tdText);
        } else if (header.includes('substat') || header.includes('sub stat')) {
          if (tdText) stats.push(`• **Substats**: ${tdText}`);
        } else if (header.includes('artifact') || header.includes('relic') || header.includes('drive disc') || header.includes('ornament')) {
          if (aMatches.length > 0) {
            artifacts.push(`• **Utama**: ${aMatches[0]}`);
            if (aMatches.length > 1) artifacts.push(`• **Alternatif**: ${aMatches.slice(1).join(', ')}`);
          } else if (tdText) artifacts.push(`• **Utama**: ${tdText}`);
        }
      }

      // Pattern 1.5: Pure TD row with number prefix (e.g. ZZZ 6: ATK, 5: ATK, 4: ...)
      if (ths.length === 0 && tds.length > 0) {
        const tdText = tds[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/^[456]:/.test(tdText)) {
          currentMainStats.push(tdText);
        }
      }

      // Pattern 2: Multi-column headers followed by td row
      if (ths.length >= 2 && i + 1 < rows.length) {
        const nextRowContent = rows[i + 1][1];
        const nextTds = [...nextRowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (nextTds.length >= 2) {
          for (let col = 0; col < Math.min(ths.length, nextTds.length); col++) {
            const h = ths[col];
            const cellHtml = nextTds[col][1];
            const aList = [...cellHtml.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim()).filter(x => x && !x.startsWith('http') && x.length > 1);
            const text = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            if (h.includes('best weapon') || h.includes('best light cone') || h.includes('best w-engine')) {
              if (aList.length > 0) weapons.push(`• **BiS**: ${aList[0]}`);
              else if (text) weapons.push(`• **BiS**: ${text}`);
            } else if (h.includes('alternative') || h.includes('replacement')) {
              if (aList.length > 0) weapons.push(`• **Alternatif/F2P**: ${aList.join(', ')}`);
              else if (text) weapons.push(`• **Alternatif/F2P**: ${text}`);
            } else if (h.includes('artifact stat') || h.includes('relic stat')) {
              const subIdx = text.toLowerCase().indexOf('sub stat');
              if (subIdx !== -1) {
                const mainP = text.slice(0, subIdx).trim();
                const subP = text.slice(subIdx).replace(/artifact\s*sub\s*stats?:?/i, '').replace(/sub\s*stats?:?/i, '').trim();
                if (mainP) stats.push(`• **Main Stats**: ${mainP}`);
                if (subP) stats.push(`• **Substats**: ${subP}`);
              } else if (text) {
                stats.push(`• **Main Stats**: ${text}`);
              }
            } else if (h.includes('main stat')) {
              if (text) stats.push(`• **Main Stats**: ${text}`);
            } else if (h.includes('sub stat')) {
              if (text) stats.push(`• **Substats**: ${text}`);
            } else if (h.includes('artifact') || h.includes('relic') || h.includes('ornament') || h.includes('drive disc')) {
              if (aList.length > 0) artifacts.push(`• **Utama**: ${aList.join(' + ')}`);
              else if (text) artifacts.push(`• **Utama**: ${text}`);
            }
          }
        }
      }

      // Pattern 3: Best Artifacts section with separate rows
      if (ths.length === 1 && ths[0].includes('alternate artifact') && i + 1 < rows.length) {
        const nextTds = [...rows[i + 1][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (nextTds.length > 0) {
          const aList = [...nextTds[0][1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim()).filter(x => x && !x.startsWith('http'));
          const text = nextTds[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (aList.length > 0) artifacts.push(`• **Alternatif**: ${aList.join(', ')}`);
          else if (text) artifacts.push(`• **Alternatif**: ${text}`);
        }
      }
    }

    if (currentMainStats.length > 0) {
      stats.unshift(`• **Main Stats**: ${currentMainStats.join(' | ')}`);
    }

    if (weapons.length > 0 && artifacts.length > 0) {
      break;
    }
  }

  // Ekstraksi Rekomendasi Tim
  let teams = [];
  const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let hMatch;
  const headings = [];
  while ((hMatch = headingRegex.exec(cleanHtml)) !== null) {
    const title = hMatch[1].replace(/<[^>]+>/g, "").trim();
    if (/team/i.test(title) && !/how to build|rating|tier list|ranking|maker|best free|best team comp/i.test(title)) {
      headings.push({ title, index: hMatch.index });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const nextIdx = i + 1 < headings.length ? headings[i + 1].index : h.index + 3500;
    const chunk = cleanHtml.slice(h.index, Math.min(nextIdx, h.index + 3500));

    const tableMatch = chunk.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      for (const r of rows) {
        const rowContent = r[1];
        if (rowContent.toLowerCase().includes("team summary") || rowContent.toLowerCase().includes("bangboo alternative")) continue;

        const charMatches = [...rowContent.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, "").trim())
          .filter(name => {
            const low = name.toLowerCase();
            return (
              name.length >= 2 &&
              name.length <= 25 &&
              !low.includes("image") &&
              !low.includes("guide") &&
              !low.includes("best") &&
              !low.includes("build") &&
              !low.includes("team") &&
              !low.includes("character") &&
              !low.includes("user")
            );
          });

        if (charMatches.length >= 2) {
          const teamLabel = h.title
            .replace(/\bteams?\b/gi, "")
            .replace(/\bcomps?\b/gi, "")
            .replace(/^[-\s:]+|[-\s:]+$/g, "")
            .trim() || "Rekomendasi";
          const memberList = [...new Set(charMatches)].slice(0, 4).join(" + ");
          teams.push(`• **${teamLabel}**: ${memberList}`);
          break;
        }
      }
    }
    if (teams.length >= 3) break;
  }

  // Deduplicate
  weapons = [...new Set(weapons)];
  artifacts = [...new Set(artifacts)];
  stats = [...new Set(stats)];
  teams = [...new Set(teams)].slice(0, 3);

  return { weapons, artifacts, stats, teams };
}

async function run() {
  console.log('🚀 Memulai HoYo Character Build Crawler (GitHub Actions)...\n');

  let currentBuilds = {};
  if (fs.existsSync(BUILDS_PATH)) {
    try {
      currentBuilds = JSON.parse(fs.readFileSync(BUILDS_PATH, 'utf8'));
      console.log(`📦 Database builds.json memiliki ${Object.keys(currentBuilds).length} entri aktif.\n`);
    } catch {
      currentBuilds = {};
    }
  }

  const discoveredCharacters = new Map(); // key -> { name, url, game, fastBuild }

  // 1. Ekstraksi Master Index Pages
  for (const page of MASTER_PAGES) {
    try {
      console.log(`🔍 [Master Scan] Membaca master page: ${page.url}...`);
      const res = await fetch(page.url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        console.warn(`   ⚠️ HTTP ${res.status} untuk ${page.url}`);
        continue;
      }
      const html = await res.text();

      // Scan rows
      const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
      for (const r of rows) {
        const rowContent = r[1];
        // Cari karakter link
        const linkMatch = rowContent.match(/href=["']?([^"'\s>]*archives\/(\d+))["']?[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;

        const innerContent = linkMatch[3];
        const imgAlt = innerContent.match(/alt=["']?([^"']+)["']?/i) || innerContent.match(/data-alt=["']?([^"']+)["']?/i);
        const innerText = innerContent.replace(/<[^>]+>/g, '').trim();

        let rawName = imgAlt ? imgAlt[1] : innerText;
        if (!rawName) continue;

        const lower = rawName.toLowerCase();
        if (
          lower.includes('character') ||
          lower.includes('user') ||
          lower.includes('dps') ||
          lower.includes('tier') ||
          lower.includes('exploration') ||
          lower.includes('reward') ||
          lower.includes('passive') ||
          lower.includes('healer') ||
          lower.includes('shielder') ||
          lower.includes('banner') ||
          lower.includes('code') ||
          lower.includes('guide') ||
          lower.includes('meta') ||
          lower.includes('list') ||
          lower.includes('ranking') ||
          lower.includes('top')
        ) {
          continue;
        }

        const charName = cleanCharName(rawName);
        if (charName.length < 2 || charName.length > 25) continue;
        if (!/[a-zA-Z]/.test(charName) || /^\d+$/.test(charName)) continue;

        const charKey = charName.toLowerCase();
        let fullUrl = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://game8.co${linkMatch[1]}`;

        // Cek jika baris ini berisi data build langsung (seperti tabel Genshin 530535)
        const linksInRow = [...rowContent.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
        const plainText = rowContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        let fastBuild = null;
        if (linksInRow.length >= 3 && plainText.includes('Main Stats:')) {
          const weapon = linksInRow[1] || '';
          const artifact = linksInRow.slice(2).join(' / ') || '';
          const msIdx = plainText.indexOf('Main Stats:');
          const statsText = msIdx !== -1 ? plainText.substring(msIdx) : '';
          const imgMatch = rowContent.match(/data-src=["']?([^"'\s>]+)["']?/i);

          fastBuild = {
            title: `${charName} Best Builds & Teams`,
            url: fullUrl,
            weapons: weapon ? `• **BiS**: ${weapon}` : '',
            artifacts: artifact ? `• **Utama**: ${artifact}` : '',
            stats: statsText ? `• ${statsText}` : '',
            thumbnail: imgMatch ? imgMatch[1] : null,
            lastUpdated: new Date().toISOString()
          };
        }

        if (!discoveredCharacters.has(charKey)) {
          discoveredCharacters.set(charKey, {
            name: charName,
            url: fullUrl,
            game: page.game,
            fastBuild
          });
        }
      }
    } catch (err) {
      console.error(`   ❌ Error scanning ${page.url}:`, err.message);
    }
    await sleep(800);
  }

  console.log(`\n✅ Ditemukan ${discoveredCharacters.size} karakter unik dari Master Pages.\n`);

  let addedCount = 0;
  let updatedCount = 0;

  for (const [key, info] of discoveredCharacters.entries()) {
    const existing = currentBuilds[key];
    const isNew = !existing;
    const isMissingData = existing && !existing.invalid && (!existing.weapons || !existing.artifacts);

    // Jika sudah ada dan valid, atau sudah ditandai bukan halaman karakter, lewati
    if (existing && (existing.invalid || (!isNew && !isMissingData))) {
      continue;
    }

    // Jika ada fastBuild lengkap dari master table, gunakan langsung
    if (info.fastBuild && info.fastBuild.weapons && info.fastBuild.artifacts) {
      currentBuilds[key] = info.fastBuild;
      if (info.name.includes(' ')) {
        const simpleName = info.name.split(' ')[0].toLowerCase();
        if (!currentBuilds[simpleName]) currentBuilds[simpleName] = info.fastBuild;
      }
      if (isNew) addedCount++; else updatedCount++;
      console.log(`   ✨ [Fast Sync] Berhasil menambahkan ${info.name}!`);
      continue;
    }

    // Jika tidak ada fastBuild, ambil halaman detail karakter
    console.log(`   ⚡ Mengambil halaman detail: ${info.name} -> ${info.url}`);
    try {
      const res = await fetch(info.url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        console.warn(`      ⚠️ HTTP ${res.status} saat mengambil ${info.name}`);
        continue;
      }
      const html = await res.text();
      const parsed = parseGame8Auto(html);

      if (parsed.weapons.length === 0 && parsed.artifacts.length === 0) {
        console.log(`      ⏩ Belum ada build lengkap untuk ${info.name}, tandai dan lewati.`);
        currentBuilds[key] = { invalid: true, lastUpdated: new Date().toISOString() };
        continue;
      }

      const imgMatch =
        html.match(/data-src=["']?([^"'\s>]+\/show)["']?/i) ||
        html.match(/src=["']?([^"'\s>]+\/show)["']?/i);
      const thumbnail = imgMatch ? imgMatch[1] : (existing ? existing.thumbnail : null);

      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/\|.*$/i, '').trim() : `${info.name} Best Builds & Teams`;

      const newEntry = {
        title,
        url: info.url,
        weapons: parsed.weapons.join('\n'),
        artifacts: parsed.artifacts.join('\n'),
        stats: parsed.stats.join('\n'),
        teams: (parsed.teams || []).join('\n'),
        thumbnail,
        lastUpdated: new Date().toISOString()
      };

      currentBuilds[key] = newEntry;

      if (info.name.includes(' ')) {
        const simpleName = info.name.split(' ')[0].toLowerCase();
        if (!currentBuilds[simpleName]) {
          currentBuilds[simpleName] = newEntry;
        }
      }

      if (isNew) {
        addedCount++;
        console.log(`      ✨ [BARU] Menambahkan build ${info.name}!`);
      } else {
        updatedCount++;
        console.log(`      🔄 [UPDATE] Memperbarui build ${info.name}!`);
      }

      // Simpan perubahan secara bertahap
      fs.writeFileSync(BUILDS_PATH, JSON.stringify(currentBuilds, null, 2), 'utf8');
    } catch (err) {
      console.error(`      ❌ Error scraping ${info.name}:`, err.message);
    }

    await sleep(600);
  }

  // Simpan final
  fs.writeFileSync(BUILDS_PATH, JSON.stringify(currentBuilds, null, 2), 'utf8');

  console.log(`\n🎉 Selesai!`);
  console.log(`   - Karakter Baru Ditambahkan: ${addedCount}`);
  console.log(`   - Karakter Diperbarui: ${updatedCount}`);
  console.log(`   - Total Karakter di Database: ${Object.keys(currentBuilds).length}\n`);
}

run();

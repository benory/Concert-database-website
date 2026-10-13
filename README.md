# Early Music Concerts

Source for [concertsdatabase.org](https://concertsdatabase.org), a research interface for performances of Medieval and Renaissance music between 1915 and 1960.

## Development and releases

The `development` branch holds the evolving website and dataset. The `main` branch continues to publish the existing landing page through GitHub Pages; do not merge development into `main` until the public launch is explicitly approved. Development code and data are visible because this repository is public, but this branch is not deployed as the live website.

The first public launch is planned for the end of the postdoctoral project and will be tagged `v1.0.0`, with a matching GitHub release. Do not create that tag or release before launch. Each release should record the website and normalized dataset together, with release notes describing changes. Subsequent releases use `vMAJOR.MINOR.PATCH`: major for incompatible changes, minor for new functionality or substantial dataset additions, and patch for corrections and fixes.

## Data workflow

The public site reads eight committed, normalized JSON files:

- `assets/data/concerts.json` contains concert-level records.
- `assets/data/programs.json` contains program items using only columns A–L of the Programs sheet. `Works` and `Programs_old` are not downloaded or used.
- `assets/data/composers.json` contains canonical names, aliases, and dating evidence from columns A–N of the Composers sheet. Program composer names remain transcriptions; `Program Composer ID` supplies the link to this authority data.
- `assets/data/people.json` contains names, narrative descriptions, and BMLO/GND/VIAF identifiers from columns A–N of the People sheet.
- `assets/data/sources.json` contains source sigla, aliases, and DIAMM links from columns A–F of the Sources sheet.
- `assets/data/editions.json` combines citation records from columns A–L of Early Editions and Bibliography so every linked edition statement can be displayed intelligibly.
- `assets/data/archives.json` contains archive names and links from columns A–I of the Archives sheet.
- `assets/data/program-previews.json` inventories the responsive first-page previews and 320px map thumbnails generated for permissioned program PDFs, including page counts and source checksums.

Refresh the JSON, upload newly permitted or changed PDFs, generate previews, and validate/build the site with:

```sh
make
```

The upload and preview tools live in the companion `../Concert-project-build` repository. Set it up once with `make -C ../Concert-project-build setup` and configure Object Read & Write credentials for the `concert-programs` bucket in `~/.config/concert-project/r2.json`. Credentials stay outside Git. See the helper repository's README for setup and checkpoint details. Unchanged, verified PDFs are skipped; permissions must explicitly be `yes`. Upload failures stop the build and retain verified checkpoints for the next run.

The download URLs are declared at the top of `Makefile` and can be overridden without editing it:

```sh
make data CONCERTS_URL='https://…' PROGRAMS_URL='https://…' COMPOSERS_URL='https://…' PEOPLE_URL='https://…' SOURCES_URL='https://…' EARLY_EDITIONS_URL='https://…' BIBLIOGRAPHY_URL='https://…' ARCHIVES_URL='https://…'
```

The concert URL is the supplied Apps Script JSON response. The Apps Script's current Programs response still exposes an older 569-row schema, so the default Programs URL reads the live public tab directly through Google Visualization JSON, constrained to A–L. The normalizer accepts both formats, rejects invalid responses, converts coordinates and numeric fields, and writes a small frontend-oriented schema. Raw downloads stay in the ignored `.cache/data` directory.

`make` automatically refreshes the upload manifest and both sizes of first-page previews. To regenerate previews locally without contacting R2:

```sh
make previews
```

The program page fits the full-size, same-origin WebP preview to the available width and height, preserving room for the footer. Zoomed images and long standardized records scroll within their panels. The complete PDF remains available through a direct link. Map popups load the smaller derivatives only when opened. Preview generation requires the local archival PDF collection, Poppler, ImageMagick, and `cwebp`. The thumbnail defaults can be overridden with `PROGRAM_THUMBNAIL_WIDTH` and `PROGRAM_THUMBNAIL_QUALITY`.

`make assets-plan` prepares an upload inventory without network access; `make assets-audit` re-verifies every permissioned R2 object; `make uploads` runs uploads and previews using the current JSON. `make build` builds from existing website assets without refreshing data or uploading. The companion and local PDF paths can be overridden with `PROGRAM_BUILD_DIR`, `PROGRAM_PYTHON`, and `PROGRAM_SOURCE_DIR`.

## Local development

Install Ruby dependencies once:

```sh
bundle install
```

Then run:

```sh
make serve
```

The site is available at `http://127.0.0.1:7777`. Run `make check` before publishing.

## Site structure

- `/` combines search, program results, a synchronized Leaflet map, and a date slider.
- `/program/?id=1925_12_05a` places standardized program data beside the surviving scan. Public program URLs omit the `CON` prefix; the underlying spreadsheet IDs remain `CON:…`. Older `CON-…` and `CON:…` links continue to work and normalize to the shorter format when opened.
- `/concerts/` is the shared search and composer-results view. Matching pieces and person roles appear within each concert entry; the search button below the input clears the filters and restores all concerts.
- `/concerts/?composer=COM%3AJosquin_des_Prez` shows a composer's concerts and pieces. Older `/composer/?id=…` and `/composer/?name=…` links forward to this view.
- `/piece/` aggregates performances of a piece across the dataset.
- `/analysis/`, `/documentation/`, and `/about/` contain project-level material.

Leaflet and Leaflet.markercluster are loaded from version-pinned CDN releases. Map tiles and data are attributed to OpenStreetMap contributors.

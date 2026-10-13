SHELL := /bin/bash
.DEFAULT_GOAL := all

CONCERTS_URL ?= https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQhVKjy3vPIyx00-6bhYf5M0U16rcSpt68Bgyq3-T2eZ1l39KJSshgc2MbGHGTBgijHi9JcxEDRfapsFWwCpmYQ8cqMAIABWxowTAKKclnWC1uMQaiF2-AEpzRPcRHdTZlcIW7hW_lTCgt3uQR9ybV8BUpMsnz-XtCx9V5QDEtXsaEFoT5JoubOWwXUnJ0ETi9UknWxAF_oK1fMjFcfeTxjfWWLh3gL0X09Vt1VZG2QsgCSgSx9sQhRId_Z0HzFz7NX8F8JpRmZ26ChXR6t87tXRfoTcg&lib=MTzKYCYrnbC3PO_wkIY5IRwnFwFTz1JXk
PROGRAMS_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=546871662&range=A:L&headers=1
COMPOSERS_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=70240979&range=A:N&headers=1
PEOPLE_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=1536272733&range=A:N&headers=1
SOURCES_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=1344935347&range=A:F&headers=1
EARLY_EDITIONS_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=327907017&range=A:L&headers=1
BIBLIOGRAPHY_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=1591477092&range=A:L&headers=1
ARCHIVES_URL ?= https://docs.google.com/spreadsheets/d/1awiufcTMCv4TptNYQgDzyrmWzRzMWzJjjU9kShRd4KU/gviz/tq?tqx=out:json&gid=1929140918&range=A:I&headers=1

RAW_DIR := .cache/data
DATA_DIR := assets/data
PROGRAM_BUILD_DIR ?= ../Concert-project-build
PROGRAM_PYTHON ?= $(PROGRAM_BUILD_DIR)/.venv/bin/python
PROGRAM_SOURCE_DIR ?= ../Documents/Concert-database-reference/New database/Concert Programs
PROGRAM_PDF_MANIFEST ?= $(PROGRAM_SOURCE_DIR)/r2-upload-manifest.csv
PROGRAM_PREVIEW_DIR := assets/images/program-previews
PROGRAM_PREVIEW_DATA := assets/data/program-previews.json
PROGRAM_THUMBNAIL_WIDTH ?= 320
PROGRAM_THUMBNAIL_QUALITY ?= 72
CURL := curl --fail --location --compressed --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 240
PROGRAM_ASSETS = "$(PROGRAM_PYTHON)" "$(PROGRAM_BUILD_DIR)/tools/program_assets.py" --website "$(CURDIR)" --source-dir "$(PROGRAM_SOURCE_DIR)" --manifest "$(PROGRAM_PDF_MANIFEST)" --thumbnail-width "$(PROGRAM_THUMBNAIL_WIDTH)" --thumbnail-quality "$(PROGRAM_THUMBNAIL_QUALITY)"

.PHONY: all data download normalize program-assets uploads assets-plan assets-audit previews build serve check clean clean-data

all: data
	$(MAKE) program-assets
	$(MAKE) check

data:
	$(MAKE) download
	$(MAKE) normalize

download:
	@mkdir -p "$(RAW_DIR)"
	@echo "Downloading concert records…"
	@$(CURL) "$(CONCERTS_URL)" --output "$(RAW_DIR)/concerts.json.tmp"
	@ruby -rjson -e 'value = JSON.parse(File.read(ARGV.fetch(0))); abort "Concert feed is not a JSON array" unless value.is_a?(Array)' "$(RAW_DIR)/concerts.json.tmp"
	@mv "$(RAW_DIR)/concerts.json.tmp" "$(RAW_DIR)/concerts.json"
	@echo "Downloading program items…"
	@$(CURL) "$(PROGRAMS_URL)" --output "$(RAW_DIR)/programs.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Programs download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/programs.json.tmp"
	@mv "$(RAW_DIR)/programs.json.tmp" "$(RAW_DIR)/programs.json"
	@echo "Downloading canonical composer names…"
	@$(CURL) "$(COMPOSERS_URL)" --output "$(RAW_DIR)/composers.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Composers download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/composers.json.tmp"
	@mv "$(RAW_DIR)/composers.json.tmp" "$(RAW_DIR)/composers.json"
	@echo "Downloading people authority records…"
	@$(CURL) "$(PEOPLE_URL)" --output "$(RAW_DIR)/people.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "People download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/people.json.tmp"
	@mv "$(RAW_DIR)/people.json.tmp" "$(RAW_DIR)/people.json"
	@echo "Downloading musical sources…"
	@$(CURL) "$(SOURCES_URL)" --output "$(RAW_DIR)/sources.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Sources download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/sources.json.tmp"
	@mv "$(RAW_DIR)/sources.json.tmp" "$(RAW_DIR)/sources.json"
	@echo "Downloading early editions…"
	@$(CURL) "$(EARLY_EDITIONS_URL)" --output "$(RAW_DIR)/editions.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Early Editions download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/editions.json.tmp"
	@mv "$(RAW_DIR)/editions.json.tmp" "$(RAW_DIR)/editions.json"
	@echo "Downloading bibliography records…"
	@$(CURL) "$(BIBLIOGRAPHY_URL)" --output "$(RAW_DIR)/bibliography.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Bibliography download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/bibliography.json.tmp"
	@mv "$(RAW_DIR)/bibliography.json.tmp" "$(RAW_DIR)/bibliography.json"
	@echo "Downloading archive authorities…"
	@$(CURL) "$(ARCHIVES_URL)" --output "$(RAW_DIR)/archives.json.tmp"
	@ruby -e 'text = File.read(ARGV.fetch(0)); abort "Archives download is not a JSON or Google Visualization response" unless text.lstrip.start_with?("[", "{", "/*O_o*/")' "$(RAW_DIR)/archives.json.tmp"
	@mv "$(RAW_DIR)/archives.json.tmp" "$(RAW_DIR)/archives.json"

normalize:
	@mkdir -p "$(DATA_DIR)"
	@ruby scripts/normalize_data.rb "$(RAW_DIR)/concerts.json" "$(RAW_DIR)/programs.json" "$(RAW_DIR)/composers.json" "$(RAW_DIR)/people.json" "$(RAW_DIR)/sources.json" "$(RAW_DIR)/editions.json" "$(RAW_DIR)/bibliography.json" "$(RAW_DIR)/archives.json" "$(DATA_DIR)"

program-assets:
	$(PROGRAM_ASSETS)

uploads: program-assets

assets-plan:
	$(PROGRAM_ASSETS) --plan

assets-audit:
	$(PROGRAM_ASSETS) --audit

previews:
	$(PROGRAM_ASSETS) --previews-only

build:
	bundle exec jekyll build

serve:
	bundle exec jekyll serve --livereload --port 7777

check:
	@ruby scripts/check_program_pages.rb "$(CURDIR)"
	@ruby -rjson -e 'ARGV.each { |path| value = JSON.parse(File.read(path)); abort "#{path} is not an array" unless value.is_a?(Array); puts "#{path}: #{value.length} records" }' "$(DATA_DIR)/concerts.json" "$(DATA_DIR)/programs.json" "$(DATA_DIR)/composers.json" "$(DATA_DIR)/people.json" "$(DATA_DIR)/sources.json" "$(DATA_DIR)/editions.json" "$(DATA_DIR)/archives.json"
	@ruby -rjson -e 'concerts = JSON.parse(File.read(ARGV.fetch(0))); errors = concerts.filter_map { |row| stem = row["id"]&.sub(/\ACON:/, "CON-"); expected = "https://programs.concertsdatabase.org/pdf/#{stem}.pdf" if row["image_permissions"] == "yes" && stem; actual = row["scan_url"]; protected = row["image_permissions"] == "yes" || !row.key?("image_url") && !row.key?("externally_hosted_image"); next if actual == expected && protected; "#{row["id"]}: permission=#{row["image_permissions"].inspect}, scan=#{actual.inspect}, expected=#{expected.inspect}" }; abort "Invalid program scan access:\n#{errors.join("\n")}" unless errors.empty?; puts "Program scan URLs respect image permissions"' "$(DATA_DIR)/concerts.json"
	@ruby -rjson -rset -e 'concerts = JSON.parse(File.read(ARGV.fetch(0))); previews = JSON.parse(File.read(ARGV.fetch(2))); permissioned = concerts.filter_map { |row| row["id"] if row["image_permissions"] == "yes" }.to_set; valid = previews.filter_map { |row| row["id"] if row["page_count"].to_i.positive? && row["pixel_width"].to_i.positive? && row["pixel_height"].to_i.positive? && row["source_sha256"].to_s.match?(/\A[0-9a-f]{64}\z/) }.to_set; missing = permissioned - valid; extras = valid - permissioned; absent_files = permissioned.filter_map { |id| stem = id&.sub(/\ACON:/, "CON-"); id unless stem && File.size?(File.join(ARGV.fetch(1), "#{stem}.webp")) }; abort "Missing program preview records: #{missing.to_a.join(", ")}" unless missing.empty?; abort "Unexpected program preview records: #{extras.to_a.join(", ")}" unless extras.empty?; abort "Missing program preview files: #{absent_files.join(", ")}" unless absent_files.empty?; puts "All permissioned program scans have responsive previews"' "$(DATA_DIR)/concerts.json" "$(PROGRAM_PREVIEW_DIR)" "$(PROGRAM_PREVIEW_DATA)"
	@ruby -rjson -e 'concerts = JSON.parse(File.read(ARGV.fetch(0))); previews = JSON.parse(File.read(ARGV.fetch(2))).to_h { |row| [row["id"], row] }; width = ARGV.fetch(3).to_i; permissioned = concerts.filter_map { |row| row["id"] if row["image_permissions"] == "yes" }; invalid = permissioned.filter_map { |id| stem = id&.sub(/\ACON:/, "CON-"); row = previews[id]; expected_prefix = "/assets/images/program-previews/#{stem}-thumb.webp?v="; valid = stem && row && row["thumbnail_url"].to_s.start_with?(expected_prefix) && row["thumbnail_render_width"].to_i == width && row["thumbnail_pixel_width"].to_i == width && row["thumbnail_pixel_height"].to_i.positive? && File.size?(File.join(ARGV.fetch(1), "#{stem}-thumb.webp")); id unless valid }; abort "Missing or invalid map thumbnails: #{invalid.join(", ")}" unless invalid.empty?; puts "All permissioned program scans have #{width}px map thumbnails"' "$(DATA_DIR)/concerts.json" "$(PROGRAM_PREVIEW_DIR)" "$(PROGRAM_PREVIEW_DATA)" "$(PROGRAM_THUMBNAIL_WIDTH)"
	@ruby -rjson -rset -e 'programs = JSON.parse(File.read(ARGV[0])); source_ids = JSON.parse(File.read(ARGV[1])).filter_map { |row| row["id"] }.to_set; edition_ids = JSON.parse(File.read(ARGV[2])).filter_map { |row| row["id"] }.to_set; missing_sources = programs.flat_map { |row| row.fetch("source_id", "").scan(/\bSRC:[\p{L}\p{N}_.-]+/) }.uniq.reject { |id| source_ids.include?(id) }; missing_editions = programs.flat_map { |row| row.fetch("edition", "").scan(/\b(?:EDN|BIB):[\p{L}\p{N}_.-]+/) }.uniq.reject { |id| edition_ids.include?(id) }; abort "Unresolved source IDs: #{missing_sources.join(", ")}" unless missing_sources.empty?; abort "Unresolved edition IDs: #{missing_editions.join(", ")}" unless missing_editions.empty?; puts "All source and edition references resolve"' "$(DATA_DIR)/programs.json" "$(DATA_DIR)/sources.json" "$(DATA_DIR)/editions.json"
	@ruby -rjson -rset -e 'concerts = JSON.parse(File.read(ARGV[0])); archive_ids = JSON.parse(File.read(ARGV[1])).filter_map { |row| row["id"] }.to_set; edition_ids = JSON.parse(File.read(ARGV[2])).filter_map { |row| row["id"] }.to_set; refs = concerts.flat_map { |row| row.fetch("archive_ids", []) }.uniq; missing_archives = refs.grep(/\AARC:/).reject { |id| archive_ids.include?(id) }; missing_bibliography = refs.grep(/\ABIB:/).reject { |id| edition_ids.include?(id) }; abort "Unresolved archive IDs: #{missing_archives.join(", ")}" unless missing_archives.empty?; abort "Unresolved concert bibliography IDs: #{missing_bibliography.join(", ")}" unless missing_bibliography.empty?; puts "All archive and concert bibliography references resolve"' "$(DATA_DIR)/concerts.json" "$(DATA_DIR)/archives.json" "$(DATA_DIR)/editions.json"
	@ruby -rjson -e 'people = JSON.parse(File.read(ARGV[0])); sources = JSON.parse(File.read(ARGV[1])); person_count = people.count { |row| %w[bmlo_id gnd_id viaf_id].any? { |key| row[key].to_s != "" } }; diamm_count = sources.count { |row| row["diamm_url"].to_s != "" }; urls = people.flat_map { |row| %w[bmlo_url gnd_url viaf_url].filter_map { |key| row[key] } } + sources.filter_map { |row| row["diamm_url"] }; invalid = urls.reject { |url| url.match?(/\Ahttps?:\/\//i) }; abort "People authority columns were not imported" if person_count.zero?; abort "DIAMM source links were not imported" if diamm_count.zero?; abort "Invalid authority URLs: #{invalid.join(", ")}" unless invalid.empty?; puts "#{person_count} people have unique identifiers; #{diamm_count} sources have DIAMM links"' "$(DATA_DIR)/people.json" "$(DATA_DIR)/sources.json"
	bundle exec jekyll build

clean:
	@rm -rf _site .jekyll-cache

clean-data:
	@rm -rf "$(RAW_DIR)" "$(DATA_DIR)/concerts.json" "$(DATA_DIR)/programs.json" "$(DATA_DIR)/composers.json" "$(DATA_DIR)/people.json" "$(DATA_DIR)/sources.json" "$(DATA_DIR)/editions.json" "$(DATA_DIR)/archives.json"

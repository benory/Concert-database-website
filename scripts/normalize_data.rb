#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "json"
require "tempfile"

abort "Usage: ruby scripts/normalize_data.rb RAW_CONCERTS RAW_PROGRAMS RAW_COMPOSERS RAW_PEOPLE RAW_SOURCES RAW_EDITIONS RAW_BIBLIOGRAPHY RAW_ARCHIVES OUTPUT_DIR" unless ARGV.length == 9

concerts_path, programs_path, composers_path, people_path, sources_path, editions_path, bibliography_path, archives_path, output_dir = ARGV

PROGRAM_SCAN_BASE_URL = ENV.fetch("PROGRAM_SCAN_BASE_URL", "https://programs.concertsdatabase.org/pdf").sub(%r{/+\z}, "").freeze

def read_records(path)
  source = File.read(path, encoding: "UTF-8")
  if source.include?("google.visualization.Query.setResponse(")
    json_source = source.sub(/\A\s*\/\*O_o\*\/\s*google\.visualization\.Query\.setResponse\(/, "").sub(/\);\s*\z/, "")
    response = JSON.parse(json_source)
    table = response["table"]
    abort "#{path}: malformed Google Visualization response" unless table.is_a?(Hash)

    headers = Array(table["cols"]).map { |column| column["label"].to_s }
    return Array(table["rows"]).map do |row|
      cells = Array(row["c"])
      values = cells.map { |cell| cell.is_a?(Hash) ? (cell.key?("v") ? cell["v"] : cell["f"]) : nil }
      headers.each_with_index.each_with_object({}) do |(header, index), record|
        # Blank F/L headers are intentionally discarded. Duplicate labels would
        # be ambiguous in object form, so retain only the first occurrence.
        next if header.empty? || record.key?(header)

        record[header] = values[index]
      end
    end
  end

  payload = JSON.parse(source)
  records = if payload.is_a?(Array)
              payload
            elsif payload.is_a?(Hash)
              payload["data"] || payload["rows"] || payload["values"]
            end
  abort "#{path}: expected a JSON array (or an object containing data/rows/values)" unless records.is_a?(Array)

  if records.first.is_a?(Array)
    headers = records.shift.map(&:to_s)
    records = records.map { |row| headers.zip(row).to_h }
  end

  abort "#{path}: every record must be a JSON object" unless records.all? { |record| record.is_a?(Hash) }
  records
rescue JSON::ParserError => error
  abort "#{path}: invalid JSON (#{error.message})"
end

def clean(value)
  return nil if value.nil?

  text = value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "").strip.gsub(/\s+/, " ")
  text.empty? ? nil : text
end

def integer(value)
  text = clean(value)
  text&.match?(/\A-?\d+\z/) ? text.to_i : nil
end

def temporal(value)
  clean(value)&.sub(/\.0\z/, "")
end

def web_url(value)
  text = clean(value)
  text if text&.match?(/\Ahttps?:\/\//i)
end

def label_from_identifier(identifier)
  clean(identifier)&.sub(/\A(?:PER|COM|ARC):/, "")&.tr("_", " ")
end

def fold(value)
  clean(value).to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.gsub(/[^\p{Alnum}]+/, " ").strip
end

def split_people(value)
  clean(value).to_s.split(/\s*;\s*/).filter_map do |entry|
    next if entry.strip.empty?

    identifier, role = entry.split(/,\s*/, 2)
    identifier = clean(identifier)
    next unless identifier

    if identifier.match?(/\A(?:PER|COM):/)
      { "id" => identifier, "name" => label_from_identifier(identifier), "role" => clean(role) }.compact
    else
      { "id" => nil, "name" => identifier, "role" => clean(role) }.compact
    end
  end
end

def split_values(value)
  clean(value).to_s.split(/\s*;\s*/).map { |part| clean(part) }.compact
end

def coordinates(value)
  parts = clean(value).to_s.split(/\s*,\s*/, 2)
  return [nil, nil] unless parts.length == 2

  latitude = Float(parts[0], exception: false)
  longitude = Float(parts[1], exception: false)
  return [nil, nil] unless latitude&.between?(-90, 90) && longitude&.between?(-180, 180)

  [latitude, longitude]
end

def normalize_concert(record)
  concert_id = clean(record["Concert ID"] || record["concert_id"] || record["id"])
  latitude, longitude = coordinates(record["Location Coordinates"] || record["location_coordinates"])
  image_permissions = clean(record["Image Permissions"] || record["image_permissions"])&.downcase
  image_url = web_url(record["Image URL"] || record["image_url"])
  external_image = web_url(record["Externally Hosted Image"] || record["externally_hosted_image"])
  # External source links are references, not permission to reproduce an image.
  image_url = nil unless image_permissions == "yes"
  hosted_scan = if image_permissions == "yes" && concert_id&.match?(/\ACON:[A-Za-z0-9_.-]+\z/)
                  "#{PROGRAM_SCAN_BASE_URL}/#{concert_id.sub(/\ACON:/, 'CON-')}.pdf"
                end

  {
    "id" => concert_id,
    "title" => clean(record["Title"] || record["title"]),
    "year" => integer(record["Year"] || record["year"]),
    "month" => integer(record["Month"] || record["month"]),
    "day" => integer(record["Day"] || record["day"]),
    "date" => clean(record["Date"] || record["date"]),
    "ensemble" => clean(record["Ensemble / Larger Event"] || record["ensemble"]),
    "location" => clean(record["Location"] || record["location"]),
    "city" => clean(record["City"] || record["city"]),
    "country" => clean(record["Country"] || record["country"]),
    "google_maps_url" => web_url(record["Google Maps URL"] || record["google_maps_url"]),
    "latitude" => latitude,
    "longitude" => longitude,
    "introduction" => split_people(record["Introduction"] || record["introduction"]),
    "direction" => split_people(record["Direction"] || record["direction"]),
    "performers" => split_people(record["Performers"] || record["performers"]),
    "archive_ids" => split_values(record["Archive (ARC)"] || record["archive_ids"]),
    "signature" => clean(record["Signature"] || record["signature"]),
    "program_notes" => clean(record["Notes on Program"] || record["program_notes"]),
    "literature" => clean(record["Literature"] || record["literature"]),
    "image_permissions" => image_permissions,
    "image_url" => image_url,
    "image_source" => clean(record["Image Source"] || record["image_source"]),
    "externally_hosted_image" => external_image,
    "scan_url" => image_permissions == "yes" ? (hosted_scan || image_url || external_image) : nil,
    "date_added" => clean(record["Date Added"] || record["date_added"]),
    "date_modified" => clean(record["Date Modified"] || record["date_modified"])
  }.compact
end

# The live Programs sheet is intentionally limited to columns A:L. Never read or
# preserve fields to the right of that range (including the discarded Works data).
PROGRAM_A_TO_L = [
  "Piece ID", "Concert ID", "Work Name in Program", "Composer Name in Program",
  "Program Composer ID", "", "Source ID", "Folios/No.",
  "Edition of Work in Program", "Nos./pp.", "Work Edition Scan", ""
].freeze

def normalize_programs(records)
  occurrence_counts = Hash.new(0)

  records.filter_map do |record|
    live_a_to_l = record.key?("Piece ID") || record.key?("Concert ID") || record.key?("Work Name in Program")

    if live_a_to_l
      # Explicit allow-list enforces A:L even when the source object contains later columns.
      row = record.select { |key, _value| PROGRAM_A_TO_L.include?(key.to_s) }
      concert_id = clean(row["Concert ID"])
      piece_id = clean(row["Piece ID"])
      work_name = clean(row["Work Name in Program"])
      composer_name = clean(row["Composer Name in Program"])
      composer_id = clean(row["Program Composer ID"])
      order = piece_id&.match(/_p(\d+)\z/i)&.captures&.first&.to_i
      source_id = clean(row["Source ID"])
      folios = clean(row["Folios/No."])
      edition = clean(row["Edition of Work in Program"])
      edition_pages = clean(row["Nos./pp."])
      work_edition_scan = web_url(row["Work Edition Scan"])
    else
      # Compatibility with the current Apps Script feed. It exposes only a small
      # record projection, so map it without importing arbitrary additional keys.
      concert_id = clean(record["Program ID"] || record["concert_id"])
      work_name = clean(record["Standardized Name of Work"] || record["Name of Work in Program"] || record["work_name"])
      composer_id = clean(record["Probable Composer"] || record["composer_id"])
      composer_name = clean(record["Composer Name as Listed in Program"] || record["composer_name"]) || label_from_identifier(composer_id)
      order = integer(record["Order in Program"] || record["order"])
      source_id = folios = edition_pages = work_edition_scan = nil
      edition = clean(record["Modern Edition"] || record["edition"])
      piece_id = clean(record["Piece ID"] || record["piece_id"])
    end

    next unless concert_id && (work_name || composer_name)

    occurrence_counts[concert_id] += 1
    order ||= occurrence_counts[concert_id]
    piece_id ||= format("%s_p%02d", concert_id, order)
    work_key = [fold(work_name), fold(composer_id || composer_name)].join("::")

    {
      "piece_id" => piece_id,
      "concert_id" => concert_id,
      "order" => order,
      "work_name" => work_name,
      "standardized_work_name" => work_name,
      "composer_name" => composer_name,
      "composer_id" => composer_id,
      "source_id" => source_id,
      "folios" => folios,
      "edition" => edition,
      "edition_pages" => edition_pages,
      "work_edition_scan" => work_edition_scan,
      "work_key" => work_key
    }.compact
  end
end

def normalize_composers(records)
  records.filter_map do |record|
    identifier = clean(record["ID"] || record["Composer ID"] || record["id"])
    next unless identifier

    name = clean(record["Composer"] || record["Name"] || record["name"]) || label_from_identifier(identifier)
    next unless name

    {
      "id" => identifier,
      "name" => name,
      "aliases" => split_values(record["Alias"] || record["Aliases"] || record["aliases"]),
      "birth_date" => temporal(record["Birth Date"] || record["birth_date"]),
      "cya_start" => temporal(record["Start of CYA"] || record["cya_start"]),
      "cya_end" => temporal(record["End of CYA"] || record["cya_end"]),
      "death_date" => temporal(record["Death Date"] || record["death_date"])
    }.compact
  end
end

def normalize_people(records)
  records.filter_map do |record|
    identifier = clean(record["On"] || record["ID"] || record["Person ID"] || record["id"])
    next unless identifier

    name = clean(record["Person"] || record["Name"] || record["name"]) || label_from_identifier(identifier)
    next unless name

    {
      "id" => identifier,
      "name" => name,
      "aliases" => split_values(record["Alias"] || record["Aliases"] || record["aliases"]),
      "birth_year" => temporal(record["Birth Year"] || record["birth_year"]),
      "death_year" => temporal(record["Death Year"] || record["death_year"]),
      "position" => clean(record["Position"] || record["position"]),
      "education" => clean(record["Education"] || record["education"]),
      "narrative_description" => clean(record["Narrative Description"] || record["narrative_description"]),
      "bmlo_id" => clean(record["BMLO ID"] || record["bmlo_id"]),
      "bmlo_url" => web_url(record["BMLO Link"] || record["BMLO URL"] || record["bmlo_url"]),
      "gnd_id" => clean(record["GND ID"] || record["gnd_id"]),
      "gnd_url" => web_url(record["GND URL"] || record["GND Link"] || record["gnd_url"]),
      "viaf_id" => clean(record["VIAF ID"] || record["viaf_id"]),
      "viaf_url" => web_url(record["VIAF URL"] || record["VIAF Link"] || record["viaf_url"])
    }.compact
  end
end

def normalize_sources(records)
  records.filter_map do |record|
    identifier = clean(record["ID"] || record["Source ID"] || record["id"])
    next unless identifier

    {
      "id" => identifier,
      "sigla" => clean(record["Source Sigla"] || record["sigla"]),
      "alias" => clean(record["Source Alias"] || record["alias"]),
      "diamm_url" => web_url(record["DIAMM Source Link"] || record["DIAMM Source URL"] || record["diamm_url"])
    }.compact
  end
end

def normalize_editions(records)
  records.filter_map do |record|
    identifier = clean(record["ID"] || record["Edition ID"] || record["id"])
    next unless identifier

    {
      "id" => identifier,
      "author" => clean(record["Composer/Author"] || record["Author"] || record["author"]),
      "article_title" => clean(record["Name of Article"] || record["article_title"]),
      "container_title" => clean(record["Name of Volume/Journal"] || record["container_title"]),
      "editor" => clean(record["Editor"] || record["editor"]),
      "volume" => temporal(record["Volume"] || record["volume"]),
      "edition" => temporal(record["Edition"] || record["edition"]),
      "series" => clean(record["Series"] || record["series"]),
      "location" => clean(record["Location"] || record["location"]),
      "publisher" => clean(record["Publisher"] || record["publisher"]),
      "publication_year" => temporal(record["Publication Year"] || record["publication_year"]),
      "pages" => clean(record["Pages"] || record["pages"])
    }.compact
  end
end

def normalize_archives(records)
  records.filter_map do |record|
    identifier = clean(record["Archive ID (ARC)"] || record["ID"] || record["Archive ID"] || record["id"])
    next unless identifier

    {
      "id" => identifier,
      "name" => clean(record["Name"] || record["Archive Name"] || record["name"]) || label_from_identifier(identifier),
      "short_name" => clean(record["Short Name"] || record["short_name"]),
      "country" => clean(record["Country"] || record["country"]),
      "city" => clean(record["City"] || record["city"]),
      "url" => web_url(record["URL (EN)"] || record["URL"] || record["url"]) || web_url(record["URL (Other)"]),
      "location" => clean(record["Archive Location"] || record["location"]),
      "narrative_description" => clean(record["Narrative Description"] || record["narrative_description"])
    }.compact
  end
end

def write_atomic(path, records)
  directory = File.dirname(path)
  FileUtils.mkdir_p(directory)
  temporary = Tempfile.new([".#{File.basename(path)}", ".tmp"], directory, encoding: "UTF-8")
  temporary.write(JSON.pretty_generate(records))
  temporary.write("\n")
  temporary.flush
  temporary.fsync
  temporary.close
  File.rename(temporary.path, path)
  File.chmod(0o644, path)
ensure
  temporary&.close!
end

concerts = read_records(concerts_path).filter_map do |record|
  concert = normalize_concert(record)
  concert if concert["id"]
end
programs = normalize_programs(read_records(programs_path))
composers = normalize_composers(read_records(composers_path))
people = normalize_people(read_records(people_path))
sources = normalize_sources(read_records(sources_path))
editions = normalize_editions(read_records(editions_path)) + normalize_editions(read_records(bibliography_path))
archives = normalize_archives(read_records(archives_path))

concerts.sort_by! { |concert| [concert["year"] || 0, concert["month"] || 0, concert["day"] || 0, concert["id"]] }
programs.sort_by! { |program| [program["concert_id"], program["order"] || 0, program["piece_id"]] }
composers.sort_by! { |composer| [fold(composer["name"]), composer["id"]] }
people.sort_by! { |person| [fold(person["name"]), person["id"]] }
sources.sort_by! { |source| [fold(source["sigla"] || source["alias"]), source["id"]] }
editions.sort_by! { |edition| [fold(edition["author"] || edition["editor"] || edition["container_title"]), edition["publication_year"].to_s, edition["id"]] }
archives.sort_by! { |archive| [fold(archive["name"]), archive["id"]] }

write_atomic(File.join(output_dir, "concerts.json"), concerts)
write_atomic(File.join(output_dir, "programs.json"), programs)
write_atomic(File.join(output_dir, "composers.json"), composers)
write_atomic(File.join(output_dir, "people.json"), people)
write_atomic(File.join(output_dir, "sources.json"), sources)
write_atomic(File.join(output_dir, "editions.json"), editions)
write_atomic(File.join(output_dir, "archives.json"), archives)

puts "Normalized #{concerts.length} concerts, #{programs.length} program items, #{composers.length} composers, #{people.length} people, #{sources.length} sources, #{editions.length} edition/bibliography records, and #{archives.length} archives into #{output_dir}"

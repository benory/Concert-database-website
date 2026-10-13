# frozen_string_literal: true

require "json"

root = File.expand_path(ARGV.fetch(0))
concerts = JSON.parse(File.read(File.join(root, "assets/data/concerts.json")))
previews = JSON.parse(File.read(File.join(root, "assets/data/program-previews.json"))).to_h { |entry| [entry.fetch("id"), entry] }
errors = []
page_count = 0
concerts.select { |concert| concert["image_permissions"] == "yes" }.each do |concert|
  preview = previews[concert.fetch("id")]
  pages = preview && preview["pages"]
  unless pages.is_a?(Array) && pages.length == preview["page_count"] && !pages.empty?
    errors << "#{concert['id']}: missing program pages"
    next
  end
  pages.each_with_index do |page, index|
    url = page["url"].to_s.split("?").first
    valid = page["page"] == index + 1 && page["pixel_width"].to_i.positive? && page["pixel_height"].to_i.positive? &&
            url.start_with?("/assets/images/program-previews/") && !url.split("/").include?("..") &&
            File.size?(File.join(root, url.delete_prefix("/")))
    errors << "#{concert['id']}: invalid page #{index + 1}" unless valid
    page_count += 1
  end
  errors << "#{concert['id']}: first-page preview differs" unless pages.first["url"] == preview["preview_url"]
end
abort errors.join("\n") unless errors.empty?
puts "All permissioned program pages are available: #{page_count} page references"

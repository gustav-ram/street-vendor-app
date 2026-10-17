-- Keeps vendor_profiles.search_doc in sync with the vendor's name, tags,
-- menu and description. 'simple' + unaccent works the same for English and
-- Spanish ("elotes", "Élote" and "elote" all match). Weights: name and tags
-- (A) rank above menu items (B) and the description (C).

CREATE OR REPLACE FUNCTION vendor_profiles_search_doc_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_doc :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.display_name, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce((
      SELECT string_agg(t.name_en || ' ' || t.name_es, ' ')
      FROM vendor_tags vt JOIN tags t ON t.id = vt.tag_id
      WHERE vt.vendor_id = NEW.id), ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce((
      SELECT string_agg(m.name || ' ' || m.description, ' ')
      FROM menu_items m
      WHERE m.vendor_id = NEW.id), ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER vendor_profiles_search_doc
  BEFORE INSERT OR UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION vendor_profiles_search_doc_trg();--> statement-breakpoint

-- Menu and tag changes re-run the trigger above by touching the profile row.
CREATE OR REPLACE FUNCTION touch_vendor_search_doc() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_id := OLD.vendor_id; ELSE v_id := NEW.vendor_id; END IF;
  UPDATE vendor_profiles SET search_doc = NULL WHERE id = v_id;
  RETURN NULL;
END $$;--> statement-breakpoint

CREATE TRIGGER menu_items_search_doc
  AFTER INSERT OR DELETE OR UPDATE OF name, description ON menu_items
  FOR EACH ROW EXECUTE FUNCTION touch_vendor_search_doc();--> statement-breakpoint

CREATE TRIGGER vendor_tags_search_doc
  AFTER INSERT OR DELETE ON vendor_tags
  FOR EACH ROW EXECUTE FUNCTION touch_vendor_search_doc();--> statement-breakpoint

-- Backfill existing rows.
UPDATE vendor_profiles SET search_doc = NULL;

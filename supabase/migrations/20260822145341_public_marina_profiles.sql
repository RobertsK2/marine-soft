alter table public.marinas
add column is_public boolean not null default false,
add column logo_url text,
add column cover_image_url text,
add column map_image_url text,
add column primary_color text not null default '#0A192F',
add column public_description text,
add column public_description_local text,
add column local_language text,
add constraint marinas_primary_color_format
  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
add constraint marinas_public_description_length
  check (public_description is null or char_length(public_description) between 1 and 600),
add constraint marinas_public_description_local_length
  check (
    public_description_local is null
    or char_length(public_description_local) between 1 and 600
  ),
add constraint marinas_local_language_length
  check (local_language is null or char_length(local_language) between 2 and 64),
add constraint marinas_logo_url_length
  check (
    logo_url is null
    or (char_length(logo_url) between 1 and 2048 and logo_url ~ '^(https://|/[^/])')
  ),
add constraint marinas_cover_image_url_length
  check (
    cover_image_url is null
    or (
      char_length(cover_image_url) between 1 and 2048
      and cover_image_url ~ '^(https://|/[^/])'
    )
  ),
add constraint marinas_map_image_url_length
  check (
    map_image_url is null
    or (
      char_length(map_image_url) between 1 and 2048
      and map_image_url ~ '^(https://|/[^/])'
    )
  );

create policy marinas_select_published
on public.marinas for select
to anon
using (is_public);

grant select (
  name,
  slug,
  timezone,
  logo_url,
  cover_image_url,
  map_image_url,
  primary_color,
  public_description,
  public_description_local,
  local_language
) on public.marinas to anon;

grant update (
  is_public,
  logo_url,
  cover_image_url,
  map_image_url,
  primary_color,
  public_description,
  public_description_local,
  local_language
) on public.marinas to authenticated;

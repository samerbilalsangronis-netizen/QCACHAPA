begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qcachapa-images', 'qcachapa-images', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif']);

create policy qcachapa_image_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'qcachapa-images'
  and public.staff_role() = 'admin'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- An administrator may clean up an upload made by their own session.
create policy qcachapa_image_owner_select on storage.objects for select to authenticated
using (bucket_id = 'qcachapa-images' and public.staff_role() = 'admin' and owner_id = (select auth.uid())::text);

create policy qcachapa_image_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'qcachapa-images' and public.staff_role() = 'admin' and owner_id = (select auth.uid())::text);

commit;

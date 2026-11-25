begin;

insert into public.categories(name)
values ('Almuerzos'), ('Cachapas'), ('Hamburguesas'), ('Perros calientes')
on conflict (name) do nothing;

-- Editable drafts. The storefront exposes them only after staff set the prices and enable them.
insert into public.products(category_id,name,description,price,available,image_url)
select categories.id, draft.name, draft.description, 0, false, draft.image_url
from (values
  ('Almuerzos','Pabellón criollo','Carne mechada, caraotas negras, arroz y tajadas.','/almuerzo-pabellon.webp'),
  ('Almuerzos','Pollo guisado','Pollo con papas y zanahorias, arroz y ensalada.','/almuerzo-pollo.webp'),
  ('Almuerzos','Asado negro','Carne en salsa oscura con arroz y plátano maduro.','/almuerzo-asado.webp'),
  ('Almuerzos','Pescado frito','Pescado dorado con patacones y ensalada fresca.','/almuerzo-pescado.webp'),
  ('Cachapas','Cachapa con queso','Cachapa de maíz con queso.','/cachapa.webp'),
  ('Hamburguesas','Hamburguesa clásica','Hamburguesa para la cena.',null),
  ('Perros calientes','Perro caliente clásico','Perro caliente para la cena.',null)
) as draft(category,name,description,image_url)
join public.categories on categories.name = draft.category
where not exists (
  select 1 from public.products p
  where p.category_id = categories.id and lower(trim(p.name)) = lower(trim(draft.name))
);

commit;

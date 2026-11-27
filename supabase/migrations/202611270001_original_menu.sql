begin;

-- References copied from the restaurant's printed menu. QCACHAPA currently
-- stores and displays its catalog prices in USD.
insert into public.categories(name) values
  ('Cachapas'), ('Cachapas de autor'), ('Cachapas especiales'),
  ('Arepas de maíz'), ('Patacones'), ('Hamburguesas'), ('Perros calientes'), ('Tequeños')
on conflict (name) do nothing;

do $$
declare
  item record;
  target_category uuid;
  matches uuid[];
begin
  for item in select * from (values
    ('Cachapas','Cachapa con queso',5.00,'Queso blanco suave, queso fundido, nata y queso rallado.',array['cachapa tradicional de queso']::text[]),
    ('Cachapas de autor','Cachapa 4 quesos',6.00,'Queso suave, mozzarella, queso amarillo, queso fundido, nata y queso rallado.',array['cachapa cuatro quesos']),
    ('Cachapas de autor','Cachapa Media Zuliana',6.00,'Queso suave, jamón de espalda, queso amarillo, queso fundido, nata y queso rallado.',array['media zuliana']),
    ('Cachapas de autor','Cachapa Andina',6.00,'Queso blanco, queso frito, queso fundido, nata y queso rallado.',array['andina']),
    ('Cachapas de autor','Q’ Molleja',10.00,'Cachapa con queso de mano, carne mechada, tajada de maduro, queso fundido, nata y queso rallado.',array['q molleja','cachapa molleja']),
    ('Cachapas de autor','Cachapa con chuleta ahumada',9.00,'Queso de mano, chuleta ahumada, queso fundido, nata y queso rallado.',array['cachapa chuleta ahumada','chuleta ahumada']),
    ('Cachapas especiales','Cachapa de carne o pollo',8.00,'Queso blanco, carne o pollo mechado, queso fundido, nata y queso rallado.',array['cachapa carne o pollo']),
    ('Cachapas especiales','Cachapa de cochino frito',9.00,'Queso de mano, cochino frito, queso fundido, nata y queso rallado.',array['cachapa cochino frito']),
    ('Cachapas especiales','Cachapa mixta',10.00,'Queso de mano, combinación de carne, pollo o cochino frito, queso fundido, nata y queso rallado.',array[]::text[]),
    ('Cachapas especiales','Cachapa hawaiana',10.00,'Queso guayanés, chuleta ahumada, tocineta, piña, queso fundido, nata y queso rallado.',array[]::text[]),
    ('Cachapas especiales','Cachapa Burger',8.00,'Cachapa junior con croqueta de res, quesos, jamón y cochino frito.',array['cachapa burguer']),
    ('Cachapas especiales','Cachapa barquisimetana',7.00,'Queso de mano, queso fundido, nata y queso rallado.',array[]::text[]),
    ('Cachapas especiales','Cachapa guayanesa',7.00,'Queso guayanés, queso fundido, nata y queso rallado.',array[]::text[]),
    ('Cachapas especiales','Cachapa sifrina de pollo o carne',9.00,'Queso de mano, jamón ahumado, carne o pollo mechado, queso fundido, nata y queso rallado.',array['cachapa sifrina']),
    ('Arepas de maíz','Arepa de carne o pollo',7.00,'Arepa de maíz amarillo o blanco, asada o frita, con queso de mano, jamón, queso amarillo, mozzarella, salsas, carne o pollo mechado y queso rallado.',array['arepa carne o pollo']),
    ('Arepas de maíz','Arepa mixta',8.00,'Arepa de maíz amarillo o blanco, asada o frita, con queso de mano, jamón, queso amarillo, mozzarella, salsas, carne, cochino y pollo mechado.',array[]::text[]),
    ('Patacones','Patacón de carne o pollo mechado',8.00,'Plátano verde frito con queso blanco, jamón, queso amarillo, mozzarella, salsas, carne o pollo mechado y queso rallado.',array['patacon de carne o pollo','patacon carne o pollo mechado']),
    ('Patacones','Patacón de cochino frito',8.00,'Plátano verde frito con queso blanco, queso amarillo, jamón, mozzarella, salsas, cochino frito y queso rallado.',array['patacon cochino frito']),
    ('Patacones','Patacón mixto',10.00,'Plátano verde frito con queso blanco, jamón, queso amarillo, mozzarella, salsas, carne, cochino y pollo mechado.',array[]::text[]),
    ('Hamburguesas','Q’ Hamburguesa',10.00,'Pan con croqueta de res o filete de pollo, chuleta, lechuga, tomate, cebolla caramelizada, pepinillos, salsas, jamón, quesos, huevo, tocineta y papas fritas.',array['q hamburguesa']),
    ('Hamburguesas','Hamburguesa Junior',7.00,'Pan con croqueta de res o filete de pollo, lechuga, tomate, salsas, jamón, quesos, huevo, tocineta y papas fritas.',array[]::text[]),
    ('Perros calientes','Perro caliente',5.00,'Pan con jamón, queso amarillo, salchicha frita, ensalada rallada, salsas, queso rallado, pepinillos y papas fritas.',array['perro caliente clasico']),
    ('Tequeños','Tequeños (10 unidades)',5.00,'Diez tequeños fritos con relleno a elegir: queso, bocadillo o chocolate.',array['tequenos'])
  ) as menu(category,name,price,description,aliases)
  loop
    select id into strict target_category from public.categories where name=item.category;

    -- Match the printed categories and variants previously filed under Cachapas.
    -- A duplicate match stops the import before any changes are committed.
    select array_agg(p.id) into matches
    from public.products p
    where (p.category_id=target_category or (
      item.category in ('Cachapas de autor','Cachapas especiales')
      and p.category_id=(select id from public.categories where name='Cachapas')
    ))
    and (translate(lower(trim(p.name)), 'áéíóúü’''', 'aeiouu') =
      any(array_append(item.aliases,translate(lower(item.name),'áéíóúü’''','aeiouu')))
      or (item.name='Q’ Hamburguesa' and p.name='Hamburguesa clásica'
        and p.description='Hamburguesa para la cena.' and p.price=0 and not p.available));

    if coalesce(cardinality(matches),0) > 1 then
      raise exception 'Hay varios productos que coinciden con «%». Revisa los duplicados antes de importar.',item.name;
    elsif coalesce(cardinality(matches),0) = 0 then
      insert into public.products(category_id,name,description,price,available)
      values(target_category,item.name,item.description,item.price,true);
    else
      update public.products
      set category_id=target_category, name=item.name, price=item.price,
        description=case when trim(description)='' or description in (
          'Cachapa de maíz con queso.','Hamburguesa para la cena.','Perro caliente para la cena.'
        ) then item.description else description end,
        available=available or (price=0 and description in (
          'Cachapa de maíz con queso.','Hamburguesa para la cena.','Perro caliente para la cena.'
        ))
      where id=matches[1];
    end if;
  end loop;
end $$;

-- The handwritten drink prices need confirmation. These rows remain editable
-- in Administración until the owner assigns prices and enables them.
insert into public.categories(name) values ('Bebidas') on conflict (name) do nothing;

insert into public.products(category_id,name,price,available)
select categories.id,drink.name,0,false
from public.categories
cross join (values
  ('Refrescos',array['refresco']::text[]),
  ('Nestea',array['te nestea']),
  ('Jugos naturales',array['jugo natural']),
  ('Malta',array[]::text[]),
  ('Merengadas',array['merengada']),
  ('Toddy',array[]::text[]),
  ('Agua',array[]::text[]),
  ('Cerveza',array[]::text[]),
  ('Tobo de cerveza',array[]::text[]),
  ('Vaso de sangría',array['sangria'])
) as drink(name,aliases)
where categories.name='Bebidas'
and not exists (
  select 1 from public.products p
  where p.category_id=categories.id
    and translate(lower(trim(p.name)),'áéíóúü','aeiouu')
      = any(array_append(drink.aliases,translate(lower(drink.name),'áéíóúü','aeiouu')))
);

commit;

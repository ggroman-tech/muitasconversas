-- Títulos só com o nome principal (sem subtítulo/sinopse depois de ":", " - " ou parênteses finais).
update books
   set title = btrim(regexp_replace(regexp_replace(regexp_replace(title, '\s*:.*$', ''), '\s+-\s+.*$', ''), '\s*\([^)]*\)\s*$', ''))
 where title <> btrim(regexp_replace(regexp_replace(regexp_replace(title, '\s*:.*$', ''), '\s+-\s+.*$', ''), '\s*\([^)]*\)\s*$', ''));

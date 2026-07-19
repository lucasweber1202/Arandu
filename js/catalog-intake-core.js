/* Arandu — parser e normalizador compartilhado do intake de catálogo. */
(function(global){
  function parseCsv(text){
    const rows=[];let row=[],cell='',quote=false;
    for(let i=0;i<String(text||'').length;i++){
      const ch=text[i],next=text[i+1];
      if(ch==='"'&&quote&&next==='"'){cell+='"';i++;continue;}
      if(ch==='"'){quote=!quote;continue;}
      if(ch===','&&!quote){row.push(cell.trim());cell='';continue;}
      if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&next==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';continue;}
      cell+=ch;
    }
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    return rows;
  }

  function pick(record,...keys){
    for(const key of keys){const candidate=record?.[key];if(candidate!==undefined&&candidate!==null&&String(candidate).trim()!=='')return candidate;}
    return '';
  }
  function slug(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
  function list(value){return Array.isArray(value)?value.map(String).map((item)=>item.trim()).filter(Boolean):String(value||'').split(/[;,|]/).map((item)=>item.trim()).filter(Boolean);}
  function yes(value){return value===true||['1','true','yes','sim','s'].includes(String(value||'').trim().toLowerCase());}
  function date(value){const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?new Date(parsed).toISOString():null;}
  function money(value){const raw=String(value||'').replace(/R\$|\s/g,'');const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const parsed=Number(normalized);return Number.isFinite(parsed)&&parsed>0?parsed:null;}
  function artistStatus(value){const normalized=String(value||'in_review').trim().toLowerCase();return({publicado:'published',aprovado:'approved','em_analise':'in_review','em análise':'in_review'}[normalized]||normalized);}
  function artworkStatus(value){const normalized=String(value||'available').trim().toLowerCase();return({disponivel:'available','disponível':'available',reservada:'reserved',reservado:'reserved',vendida:'sold',vendido:'sold'}[normalized]||normalized);}

  function normalize(record){
    const declared=String(pick(record,'tipo','kind','item_type','categoria')||'').toLowerCase();
    const hasArtworkTitle=Boolean(pick(record,'title','titulo','titulo_obra'));
    const isArtist=declared.includes('artista')||(!declared&& !hasArtworkTitle);
    if(isArtist){
      const name=pick(record,'name','nome','nome_artistico','artist_name');
      return{panel:'artistas',data:{
        id:pick(record,'id','artist_id','artista_id')||slug(name),
        name,
        legal_name:pick(record,'legal_name','nome_completo'),
        city:pick(record,'city','cidade'),state:pick(record,'state','estado','uf'),region:pick(record,'region','regiao'),
        languages:list(pick(record,'languages','linguagens','linguagem')),
        curatorial_axes:list(pick(record,'curatorial_axes','eixos_curatoriais','eixos')),
        profile:pick(record,'profile','bio','bio_curta','perfil'),trajectory:pick(record,'trajectory','trajetoria'),statement:pick(record,'statement'),
        portfolio_url:pick(record,'portfolio_url','portfolio'),instagram:pick(record,'instagram'),image_url:pick(record,'image_url','photo_url','imagem_principal'),
        status:artistStatus(pick(record,'status','status_curatorial')),
        identity_verified:yes(pick(record,'identity_verified','identidade_verificada')),
        publishing_consent_at:date(pick(record,'publishing_consent_at','consentimento_publicacao_em')),
        verified_at:date(pick(record,'verified_at','artista_verificado_em')),
        source_reference:pick(record,'source_reference','fonte_referencia')
      }};
    }
    const title=pick(record,'title','titulo','titulo_obra');
    return{panel:'obras',data:{
      id:pick(record,'id','artwork_id','obra_id')||slug(title),title,
      artist_id:pick(record,'artist_id','artista_id'),
      technique:pick(record,'technique','tecnica'),type:pick(record,'type','tipo_obra','linguagem'),support:pick(record,'support','suporte'),
      price:money(pick(record,'price','preco')),price_label:pick(record,'price_label','preco_label'),dimensions:pick(record,'dimensions','dimensoes'),
      year:pick(record,'year','ano'),edition:pick(record,'edition','edicao','edicao_tiragem'),certificate:yes(pick(record,'certificate','certificado')),
      tags:list(pick(record,'tags','etiquetas')),recommended_for:list(pick(record,'recommended_for','contextos')),
      summary:pick(record,'summary','resumo'),curatorial_reading:pick(record,'curatorial_reading','curatorial_note','leitura_curatorial','leitura'),
      main_image_url:pick(record,'main_image_url','image_url','imagem_principal'),detail_image_url:pick(record,'detail_image_url','imagem_detalhe'),room_image_url:pick(record,'room_image_url','imagem_ambiente'),
      status:artworkStatus(pick(record,'status')),
      image_authorized_at:date(pick(record,'image_authorized_at','autorizacao_imagem_em')),
      price_verified_at:date(pick(record,'price_verified_at','preco_verificado_em')),
      availability_verified_at:date(pick(record,'availability_verified_at','disponibilidade_verificada_em')),
      catalog_verified_at:date(pick(record,'catalog_verified_at','catalogo_verificado_em')),
      source_reference:pick(record,'source_reference','fonte_referencia')
    }};
  }

  function validate(item){
    const errors=[],warnings=[],data=item.data||{};
    if(item.panel==='artistas'&&!data.name)errors.push('Nome do artista é obrigatório.');
    if(item.panel==='obras'&&!data.title)errors.push('Título da obra é obrigatório.');
    if(item.panel==='obras'&&!data.artist_id)errors.push('artist_id é obrigatório para obra.');
    if(item.panel==='obras'&&!data.main_image_url)errors.push('Imagem principal ausente.');
    if(item.panel==='obras'&&!data.price&&!data.price_label)errors.push('Preço ou preço exibido ausente.');
    if(item.panel==='artistas'){
      if(!data.identity_verified)warnings.push('Identidade ainda não verificada.');
      if(!data.publishing_consent_at)warnings.push('Consentimento de publicação ausente.');
      if(!data.verified_at)warnings.push('Data de verificação do artista ausente.');
      if(!data.source_reference)warnings.push('Fonte de comprovação ausente.');
    }else{
      if(!data.image_authorized_at)warnings.push('Autorização de imagem ausente.');
      if(!data.price_verified_at)warnings.push('Preço ainda não verificado.');
      if(!data.availability_verified_at)warnings.push('Disponibilidade ainda não verificada.');
      if(!data.catalog_verified_at)warnings.push('Revisão final de catálogo ausente.');
      if(!data.source_reference)warnings.push('Fonte de comprovação ausente.');
    }
    return{errors,warnings};
  }

  function buildEntries(text){
    const rows=parseCsv(text);if(rows.length<2)return[];
    const headers=rows[0].map((header)=>header.trim());
    return rows.slice(1).map((row,index)=>{
      const raw=Object.fromEntries(headers.map((header,column)=>[header,row[column]||'']));
      const item=normalize(raw);const result=validate(item);
      return{index:index+2,raw,item,...result};
    });
  }

  global.AranduCatalogIntakeCore={parseCsv,normalize,validate,buildEntries};
})(globalThis);

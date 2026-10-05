async function fetchDataByTypes(types = ["products"]) {
  const { data, error } = await client
    .from("information")
    .select(
      `
            *,
            categories!information_category_id_fkey!inner(type)
        `
    )
    .in("categories.type", types);

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []).map(({ categories, ...info }) => ({
    ...info,
    type: categories?.type ?? null,
  }));
}

async function fetchDataById(id) {
  const { data, error } = await client
    .from("information")
    .select()
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function fetchTestimonials() {
  const { data, error } = await client.from("testimonials").select('*, user:users!testimonials_author_id_fkey(*)');

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []).map(({ user, ...info }) => ({
    ...info,
    name: user?.name ?? "Anonymous",
    email: user?.email ?? null,
  }));
}

async function subscribe(email) {
  const { error } = await client.from("subscription").insert({ email });
  if (error) throw error;
}

async function fetchCategoriesByType(type = "gallery") {
  const { data, error } = await client
    .from("categories")
    .select()
    .eq("type", type);

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function fetchGallery() {
  return fetchDataByTypes(["gallery"]);
}

async function fetchBlogsByCategoryId(keyword = "", categoryId = "All", page = 1, pageSize = 2) {
  const safeCategoryId = Number(categoryId);
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 2);

  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  let query = client
    .from("information")
    .select(`
    id,
    title,
    category_id,
    author_id,
    thumbpath,
    summary,
    created_at,
    author:users!information_author_id_fkey(id, name),
    category:categories!information_category_id_fkey!inner (id, name, type),
    comment:comment!comment_blog_id_fkey(id)
  `,
      { count: "exact" }, // lay tong so blogs de tinh so trang
    )
    .eq("category.type", "blogs")
    .order("created_at", { ascending: false });

  if (!Number.isNaN(safeCategoryId) && safeCategoryId > 0) {
    query = query.eq("category_id", safeCategoryId);
  }
  const textSearch = (keyword || "").trim();
  if (textSearch) {
    query = query.or(
      `title.ilike.%${textSearch}%,summary.ilike.%${textSearch}%,description.ilike.%${textSearch}%`
    );
  }
  const { data, error, count } = await query.range(from, to);
  const totalItems = count ?? 0;
  const pageCount = Math.ceil(totalItems / safePageSize);
  const prevPage = Math.max(1, safePage - 1);
  const nextPage = Math.min(Math.max(pageCount, 1), safePage + 1);

  const pagination = {
    currentPage: safePage,
    pageCount,
    category: categoryId,
    size: safePageSize,
    prevPage,
    nextPage,
    startFromFirstPage: safePage <= 1,
    endAtLastPage: safePage >= pageCount,
    keyword,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      number: i + 1,
      isCurrent: i + 1 === safePage,
    })),
  };

  if (error) {
    console.error(error);
    return {
      data: [],
      pagination: {
        ...pagination,
        pageCount: 0,
        pages: [],
        startFromFirstPage: true,
        endAtLastPage: true,
        keyword
      },
      error,
    };
  }

  return { data, pagination, error };
}

async function fetchBlogById(id) {
  const { data, error } = await client
    .from("information")
    .select(`
            id,
            title,
            category_id,
            author_id,
            imagepath,
            description,
            created_at,
            author:users!information_author_id_fkey(id, name),
            category:categories!information_category_id_fkey!inner(id, name, type),
            comment:comment!comment_blog_id_fkey(
                id,
                message,
                created_at,
                author:users!comment_author_id_fkey(id, name)
            )
        `)
    .eq("id", id)
    .order("created_at", { ascending: false, foreignTable: "comment" })
    .single();

  if (error) {
    console.error("Error fetching blog details", error);
    return null;
  }

  return data;
}

async function sendMessage(name, email, subject, message) {
  const { error } = await client
    .from("contacts")
    .insert({ email, name, subject, message });

  if (error) throw error;
}
async function fetchDataByKeyword(keyword) {
  const textSearch = (keyword || "").trim();
  const excluded = [31, 32, 33, 34];

  let query = client
    .from("information")
    .select(
      `
            id,
            title,
            summary,
            thumbpath
        `
    )
    .not("category_id", "in", `(${excluded.join(",")})`);

  if (textSearch) {
    query = query.or(
      `title.ilike.%${textSearch}%,summary.ilike.%${textSearch}%,description.ilike.%${textSearch}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error searching data", error);
    return [];
  }

  return data;
}

async function supabaseSignUp(email, password, name) {
  let { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;

  ({ error } = await client.from("users").insert({
    id: data.user.id,
    name,
  }));

  if (error) throw error;
  return data;
}

client.auth.onAuthStateChange((event, session) => {
  initAuthUI(session);
})

async function initAuthUI(session) {
  const isLogin = Boolean(session?.user);

  document
    .querySelectorAll(".isLogout")
    .forEach((item) => item.classList.toggle("hidden", isLogin));
  document
    .querySelectorAll(".isLogin")
    .forEach((item) => item.classList.toggle("hidden", !isLogin));

  if (!isLogin) return;

  const emailInput = document.querySelector("#crud-modal #email");
  const nameInput = document.querySelector("#crud-modal #name");
  const idInput = document.querySelector("#crud-modal #id");
  if (!emailInput || !nameInput || !idInput) return; // page has no profile modal

  const { id, email } = session.user;
  const profile = await fetchUserProfile(id);
  emailInput.value = email;
  nameInput.value = profile?.name ?? "";
  idInput.value = id;
}

async function fetchUserProfile(id) {
  const { data, error } = await client
    .from("users")
    .select("name")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Fetch User Profile Error", error);
    return null;
  }

  return data;
}

async function updateUserProfile(id, name) {
  const { data, error } = await client
    .from("users")
    .update({ name })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("No row was updated. The user row may not exist, or an UPDATE policy is blocking it.");
  }
}

async function supabaseLogout() {
  const { error } = await client.auth.signOut();
  if (error) throw error;

}

async function supabaseLogin(email, password) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}
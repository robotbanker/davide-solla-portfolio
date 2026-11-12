const test = require("node:test");
const assert = require("node:assert/strict");
const { mergePublicAlbumData, sanitizePublicSiteData } = require("../lib/admin-store");

test("newer published project SEO survives the next admin save without losing private fields", () => {
  const privateSite = {
    clients: [{ id: "client-1", email: "private@example.com" }],
    albums: [{
      id: "dreamland",
      updatedAt: "2026-10-01T00:00:00.000Z",
      description: "Old summary",
      credits: [{ name: "Private collaborator" }],
      covers: [{ src: "cover.jpg", alt: "Dreamland 1", lightroomAssetId: "private-cover" }],
      images: [{ src: "image.jpg", alt: "Dreamland 2", lightroomAssetId: "private-image" }]
    }]
  };
  const publishedSite = {
    albums: [{
      id: "dreamland",
      updatedAt: "2026-11-12T08:18:58.000Z",
      description: "Coastal portrait story",
      servicePath: "/services/fashion-photographer-london",
      covers: [{ src: "cover.jpg", alt: "Portrait on Atlantic rocks" }],
      images: [{ src: "image.jpg", alt: "Portrait beside the shore" }]
    }]
  };

  const merged = mergePublicAlbumData(privateSite, publishedSite);
  const album = merged.albums[0];
  assert.equal(album.description, "Coastal portrait story");
  assert.equal(album.servicePath, "/services/fashion-photographer-london");
  assert.equal(album.covers[0].alt, "Portrait on Atlantic rocks");
  assert.equal(album.images[0].alt, "Portrait beside the shore");
  assert.equal(album.images[0].lightroomAssetId, "private-image");
  assert.deepEqual(album.credits, [{ name: "Private collaborator" }]);
  assert.deepEqual(merged.clients, [{ id: "client-1", email: "private@example.com" }]);
  assert.equal(sanitizePublicSiteData(merged).albums[0].servicePath, album.servicePath);
});

test("newer admin project edits remain authoritative", () => {
  const privateSite = { albums: [{
    id: "dreamland",
    updatedAt: "2026-11-13T00:00:00.000Z",
    description: "Updated in admin",
    images: [{ src: "image.jpg", alt: "Admin description" }]
  }] };
  const publishedSite = { albums: [{
    id: "dreamland",
    updatedAt: "2026-11-12T08:18:58.000Z",
    description: "Older published copy",
    images: [{ src: "image.jpg", alt: "Older description" }]
  }] };

  const album = mergePublicAlbumData(privateSite, publishedSite).albums[0];
  assert.equal(album.description, "Updated in admin");
  assert.equal(album.images[0].alt, "Admin description");
});

import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://shotcraft.dev",
  integrations: [
    starlight({
      title: "Shotcraft",
      description:
        "Capture your live app and ship App Store-ready screenshots, README hero images, and social cards in one command.",
      logo: { src: "./src/assets/logo.svg", replacesTitle: false },
      social: {
        github: "https://github.com/miopea/shotcraft",
      },
      editLink: {
        baseUrl: "https://github.com/miopea/shotcraft/edit/main/docs/",
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "What is Shotcraft?", slug: "" },
            { label: "Getting started", slug: "getting-started" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Config", slug: "config" },
            { label: "CLI", slug: "cli" },
          ],
        },
        {
          label: "Templates",
          items: [
            { label: "Gallery", slug: "templates" },
            { label: "Build your own", slug: "contributing/templates" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});

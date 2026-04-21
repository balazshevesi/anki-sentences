{
  description = "Dev shell for anki-language-sentence-study-decks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            uv
            python312
            ruff
            patch
          ];

          shellHook = ''
            export UV_PROJECT_ENVIRONMENT=".venv"

            if [ ! -f source/.env ] && [ -f source/.env.example ]; then
              cp source/.env.example source/.env
              echo "Created source/.env from source/.env.example"
            fi

            if [ -f source/package.json ]; then
              echo "Installing JS deps in source/"
              bun install --cwd source
            fi

            if [ -f source/modules/cardTemplate/package.json ]; then
              echo "Installing JS deps in source/modules/cardTemplate/"
              bun install --cwd source/modules/cardTemplate
            fi

            if [ -f source/modules/wordTranslator/pyproject.toml ]; then
              echo "Installing Python deps in source/modules/wordTranslator/"
              uv sync --directory source/modules/wordTranslator
            fi

            echo "Dev shell ready."
          '';
        };
      }
    );
}

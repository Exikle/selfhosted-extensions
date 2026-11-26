# Self-hosted Extensions

Paperback 0.9 extensions for self-hosted media servers.

Built on the [Inkdex template-extensions](https://github.com/inkdex/template-extensions) scaffold.

This repo holds a Komga extension that reads your own Komga server.

## Install

In Paperback, add this repository:

```
https://exikle.github.io/selfhosted-extensions/0.9/stable
```

Paperback only loads repositories over HTTPS. The source lives on Forgejo (`git.dcunha.io/Exikle/selfhosted-extensions`), which push-mirrors to GitHub. Each push to `0.9/stable` builds the bundle there and publishes it to GitHub Pages (`.github/workflows/pages.yaml`).

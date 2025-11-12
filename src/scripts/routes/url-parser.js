const UrlParser = {
  parseActiveUrl(){
    return location.hash || '#/home';
  }
};
export default UrlParser;
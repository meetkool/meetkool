// recursion with base condition
// =================================================================
// #include <bits/stdc++.h>
// using namespace std;

// int cut =0;
// void print(int cut1){

//     if (cut == cut1){
//         return ;
//     }
//     cout << cut << " ";
//     cut++;
//     print(cut1);
// }

// int main() {
//     #ifndef ONLINE_JUDGE
// freopen("input.txt", "r", stdin);
// freopen("output.txt", "w", stdout);
// #endif
//     int cut1 = 0;
// cin>>cut1;
// print(cut1);
//     return 0;
// }

// ==========================================================
// video-2 
// ==========================================================

//------------------------------------------------------------------------------
//print name N time using recursion
// =================================================================
// #include <bits/stdc++.h>
// using namespace std;

// void fn(int i,int n){
//     if (i == n){
//         return;
//     }
//     cout << "meet:-"<< i<< endl;
//     fn(i+1,n);
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     fn(1,n);
//     return 0;
// }

/*
Recursion Tree:

For n = 3:

                fn(1, 3)
                   |
                   |
            meet:-1
                   |
                   |
                fn(2, 3)
                   |
                   |
            meet:-2
                   |
                   |
                fn(3, 3)
                   |
                   |
            meet:-3
                   |
                   |
                return
*/


// -------------------------------------------------------------------
// print n to 1 using recursion
// =================================================================
// #include <bits/stdc++.h>
// using namespace std;


// void fn(int n){
//     if (n == 0){
//         return;
//     }
//     cout << n << " ";
//     fn(n-1);
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     fn(n);
//     return 0;
// }

// -------------------------------------------------------------------
// print 1 to n usign resursion backtracking that means not allowed to use i + 1
// =================================================================
// #include <bits/stdc++.h>
// using namespace std;

// void fn(int i,int n){

//     if (i <1){
//         return;
//     }
//     fn(i-1,n);
//     cout << i << " ";
//     return;

//     }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     fn(n,n);
//     return 0;
// }

// -------------------------------------------------------------------
// print n to 1  usign resursion backtracking that means not allowed to use i - 1
// =================================================================

// #include <bits/stdc++.h>
// using namespace std;

// void fn(int i,int n){

//     if (i >n){
//         return;
//     }
//     fn(i+1,n);
//     cout << i << " ";
//     return;

//     }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     fn(1,n);
//     return 0;
// }

// ==========================================================
// video-3
// ==========================================================


// -------------------------------------------------------------------
// print the sum of fist n usign recursion
// ===================================================================
//---
// (using paramiter way)
//---
// #include <bits/stdc++.h>
// using namespace std;

// void fn(int n,int sum){
//     if (n<1 ){
//         cout << sum << endl;
//         return;
//     }
//     fn(n-1,sum+n);
//     return;

// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     int sum =0;
//     fn(n,sum);
//     return 0;
// }
//---
//  (using functional way)
//---
// #include <bits/stdc++.h>
// using namespace std;

// int fn(int n){
//     if (n==0){
//         return 0;
//     }
//     return (n + fn(n-1));
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     cout << fn(n);
//     return 0;
// }


// -------------------------------------------------------------------
// revvers an array using recursion
// ===================================================================
// first revers the arre using for loop
// #include <bits/stdc++.h>
// using namespace std;
// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     int a[n];
//     for (int i =0;i<n;i++){
//         cin>>a[i];
//     }
// for (int i=0;i <n/2;i++){
//     int temp = a[i];
//     a[i]= a[n-1-i];
//     a[n-1-i]=temp;
// }

// for (int i =0;i<n;i++){
//     cout << a[i] << " ";
// }

// }

// now with recursion
// #include <bits/stdc++.h>
// using namespace std;


// void fn(int a[],int s,int e){
//     // void fn(int i,int a[],int n){             ---------------only with 1 ver

//     if (s>=e) {
//         for(int i=0;i< e+s+1;i++){
//             cout << a[i] << " ";
//         }
//         return ;}
//     // if (i>=n/2) {             ---------------only with 1 ver
//     //     for(int i=0;i< n;i++){
//     //         cout << a[i] << " ";
//     //     }
//     //     return ;}
//     swap(a[s],a[e]);
//     // swap(a[i],a[n-1-i]);             ---------------only with 1 ver
//     fn(a,s+1,e-1);
//     // fn(i+1,a,n);             ---------------only with 1 ver

// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     int a[n];
//     for (int i =0;i<n;i++){
//         cin>>a[i];
//     }
//     fn(a,0,n-1);
//     // fn(0,a,n);             ---------------only with 1 ver

// }

// -------------------------------------------------------------------------------------

// #include <bits/stdc++.h>
// using namespace std;


// void fn(int i,int a[],int n ){
//     if (i >=n/2){
//         for (int i = 0; i < n; i++)
//         {
//             cout<<a[i]<<" ";
//         }
//         return ;
//     }
//     swap(a[i],a[n-1-i]);
//     fn(i+1,a,n);
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     int n;cin>>n;
//     int a[n];
//     for (int i =0;i<n;i++){
//         cin>>a[i];
//     }
//     fn(0,a,n);
// }
// -------------------------------------------------------------------
// check the string is the palaindrome or not using recursion
// ===================================================================
// #include <bits/stdc++.h>
// using namespace std;

// void fn(string s,int i,int n){
//     if (i>=n/2){
//         cout << "true" << endl;
//         return ;
//     }
//     if(s[i]!= s[n-1-i]){
//         cout << "false" << endl;
//         return ;
//     }
//     fn(s,i+1,n);
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     string s;cin>>s;
//     fn(s,0,s.length());
// }
// -------------------------------
// simplified
// -------------------------------
// bool fn(string s, int i){
//     if(i>=s.size()/2) return true;
//     if(s[i]!=s[s.size()-i-1])return false;
//     return fn(s,i+1);
// }

// int main(){
//         #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif
//     string s ;cin >>s;
//     fn(s,0);
// }

// ==========================================================
// video-4 | Multiple Recursion Calls 
// ==========================================================
// -------------------------------------------------------------------
// Fibonacci no in recursion
// ===================================================================
//simple expalin
// fn(0) -> 0;fn(1) -> 1; 2+fn(n-1)+fn(n-2) ;

// #include<bits/stdc++.h>
// using namespace std;

// int fn(int n){
//     if(n<=1) return n;
//     int l= fn(n-1);
//     int b=fn(n-2);
//     return l+b;
// }

// int main(){
//     #ifndef ONLINE_JUDGE
//     freopen("input.txt", "r", stdin);
//     freopen("output.txt", "w", stdout);
//     #endif

//     int n;cin>>n;
//     cout<<fn(n);

// }
// ==========================================================
// video-5 |  Recursion on Subsequences 
// ==========================================================

